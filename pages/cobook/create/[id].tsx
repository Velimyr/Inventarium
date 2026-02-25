'use client';

import { useRouter } from 'next/router';
import { supabase } from '../../../lib/supabaseClient';
import Header from '../../../components/header';
import Toast from '../../../components/Toast';
import { useEffect, useState, useRef, useCallback } from 'react';
import { ArrowLeft, Upload, FileText, CheckCircle, AlertTriangle, Loader2, X, BookOpen, Scissors } from 'lucide-react';
import cobookConfig from '../cobook.json';
import cobookErrors from '../cobook_errors.json';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type UploadStatus = 'pending' | 'uploading' | 'done' | 'error';

interface FileEntry {
    file: File;
    status: UploadStatus;
    error?: string;
}

type FlowStage =
    | 'idle'
    | 'init'
    | 'upload-init'
    | 'uploading'
    | 'finalizing'
    | 'confirming'
    | 'polling'
    | 'done'
    | 'error';

interface CobookConfig {
    base_url: string;
    token: string;
    chunk_size_mb: number;
}

// ---------------------------------------------------------------------------
// PDF page range types
// ---------------------------------------------------------------------------
interface PdfPageRange {
    raw: string;          // user input, e.g. "1-50" or "1,3,5-10"
    isValid: boolean;
    errorMsg: string;
    totalPages: number | null; // detected from the file
    resolvedPages: number[];   // 0-based page indices
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

function isPdf(file: File): boolean {
    return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

// Parse a page range string like "1-5, 7, 10-12" into 0-based indices
function parsePageRange(raw: string, totalPages: number): { pages: number[]; error: string } {
    const pages: number[] = [];
    if (!raw.trim()) {
        return { pages: [], error: '' };
    }
    const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
    for (const part of parts) {
        if (/^\d+$/.test(part)) {
            const n = parseInt(part, 10);
            if (n < 1 || n > totalPages) {
                return { pages: [], error: `Сторінка ${n} виходить за межі (1–${totalPages})` };
            }
            pages.push(n - 1);
        } else if (/^\d+-\d+$/.test(part)) {
            const [a, b] = part.split('-').map(Number);
            if (a > b) return { pages: [], error: `Діапазон ${part}: початок більший за кінець` };
            if (a < 1 || b > totalPages) {
                return { pages: [], error: `Діапазон ${part} виходить за межі (1–${totalPages})` };
            }
            for (let i = a; i <= b; i++) pages.push(i - 1);
        } else {
            return { pages: [], error: `Невірний формат: "${part}"` };
        }
    }
    // deduplicate, preserve order
    const unique = [...new Set(pages)].sort((a, b) => a - b);
    return { pages: unique, error: '' };
}

// Detect total page count from PDF ArrayBuffer by scanning xref
async function detectPdfPageCount(file: File): Promise<number | null> {
    try {
        // Dynamic import — only needed when user selects PDF
        const { PDFDocument } = await import('pdf-lib');
        const buf = await file.arrayBuffer();
        const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
        return doc.getPageCount();
    } catch {
        return null;
    }
}

// Slice a PDF file to only the specified 0-based page indices
async function slicePdf(file: File, pageIndices: number[]): Promise<File> {
    const { PDFDocument } = await import('pdf-lib');
    const buf = await file.arrayBuffer();
    const srcDoc = await PDFDocument.load(buf, { ignoreEncryption: true });
    const newDoc = await PDFDocument.create();
    const copied = await newDoc.copyPages(srcDoc, pageIndices);
    copied.forEach(p => newDoc.addPage(p));
    const bytes = await newDoc.save();
    const blob = new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], { type: 'application/pdf' });
    // Keep original filename
    return new File([blob], file.name, { type: 'application/pdf' });
}

// ---------------------------------------------------------------------------
// Error handling helpers
// ---------------------------------------------------------------------------
function extractErrorCode(errorData: any): string | null {
    try {
        const message = errorData?.message || errorData?.error_message || errorData?.detail || null;
        if (errorData?.internal_code && errorData.internal_code !== 'VALIDATION_ERROR') {
            console.info('CoBook API error:', { internal_code: errorData.internal_code, message, extracted_code: errorData.internal_code });
            return errorData.internal_code;
        }
        if (errorData?.internal_code === 'VALIDATION_ERROR' && errorData?.error_codes) {
            const values = Object.values(errorData.error_codes);
            for (const value of values) {
                if (Array.isArray(value) && value.length > 0) {
                    const code = value[0];
                    if (typeof code === 'string' && code.length > 0) {
                        console.info('CoBook API validation error:', { internal_code: errorData.internal_code, message, extracted_code: code, error_codes: errorData.error_codes });
                        return code;
                    }
                }
            }
        }
    } catch (err) {
        console.error('Error extracting error code:', err);
    }
    return null;
}

function normalizeEndpoint(path: string): string {
    if (path.startsWith('/api/projects/init')) return 'POST /projects/init';
    if (path.startsWith('/api/uploads/init')) return 'POST /uploads/init';
    if (path.match(/^\/api\/uploads\/[^/]+\/file$/)) return 'POST /uploads/{upload}/file';
    if (path.match(/^\/api\/uploads\/[^/]+\/chunk$/)) return 'POST /uploads/{upload}/chunk';
    if (path.match(/^\/api\/uploads\/[^/]+\/finalize$/)) return 'POST /uploads/{upload}/finalize';
    if (path.match(/^\/api\/uploads\/[^/]+\/status/)) return 'GET /uploads/{upload}/status';
    if (path.startsWith('/api/projects/confirm/status')) return 'GET /projects/confirm/status';
    if (path.startsWith('/api/projects/confirm')) return 'POST /projects/confirm';
    return path;
}

function getErrorMessage(path: string, errorCode: string): string {
    const DEFAULT_ERROR = 'Виникли технічні проблеми при створенні проєкту. Повторіть спробу пізніше';
    try {
        const endpoint = normalizeEndpoint(path);
        const errors = (cobookErrors as any)[endpoint];
        if (!errors || !Array.isArray(errors)) return DEFAULT_ERROR;
        const errorEntry = errors.find((e: any) => e.code === errorCode);
        if (errorEntry && errorEntry.message_ua) return errorEntry.message_ua;
        const compositeEntry = errors.find((e: any) => {
            if (!e?.code || typeof e.code !== 'string') return false;
            if (!e.code.includes(' / ')) return false;
            const parts = e.code.split(' / ').map((p: string) => p.trim()).filter(Boolean);
            return parts.includes(errorCode);
        });
        if (compositeEntry && compositeEntry.message_ua) return compositeEntry.message_ua;
    } catch (err) {
        console.error('Error looking up error message:', err);
    }
    return DEFAULT_ERROR;
}

const STAGE_STEPS = [
    { key: 'init', label: 'Ініціалізація сеансу', stageLabel: 'Ініціалізація сеансу…' },
    { key: 'upload-init', label: 'Підготовка завантаження', stageLabel: 'Підготовка завантаження…' },
    { key: 'uploading', label: 'Завантаження файлів', stageLabel: 'Завантаження файлів…' },
    { key: 'finalizing', label: 'Фіналізація', stageLabel: 'Фіналізація завантаження…' },
    { key: 'confirming', label: 'Підтверждення', stageLabel: 'Підтверждення створення проекту…' },
    { key: 'polling', label: 'Обробка проекту', stageLabel: 'Обробка проекту…' },
    { key: 'done', label: 'Проект створено', stageLabel: 'Проект створено успішно' },
] as const;

const STAGE_LABELS = STAGE_STEPS.reduce((acc, step) => {
    acc[step.key] = step.stageLabel;
    return acc;
}, { idle: '', error: 'Помилка' } as Record<FlowStage, string>);

const STAGE_PROGRESS_LABELS: Record<string, string> = {
    initializing: 'Ініціалізація',
    moving_files: 'Перенесення файлів',
    commands: 'Створення задач',
    completed: 'Завершено',
    error: 'Помилка',
};

const getFriendlyError = (failedStage: FlowStage): string => {
    switch (failedStage) {
        case 'init': return 'Не вдалося ініціалізувати сеанс. Спробуйте ще раз.';
        case 'upload-init': return 'Не вдалося підготувати завантаження файлів. Спробуйте ще раз.';
        case 'uploading': return 'Помилка під час завантаження файлів. Спробуйте ще раз.';
        case 'finalizing': return 'Не вдалося завершити завантаження файлів. Спробуйте ще раз.';
        case 'confirming': return 'Не вдалося підтвердити створення проекту. Спробуйте ще раз.';
        case 'polling': return 'Проект обробляється занадто довго або сталася помилка. Спробуйте ще раз.';
        default: return 'Сталася помилка під час створення проекту. Спробуйте ще раз.';
    }
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function CobookCreatePage() {
    const router = useRouter();
    const { id } = router.query;

    const [record, setRecord] = useState<any | null>(null);
    const [loading, setLoading] = useState(true);

    const [files, setFiles] = useState<FileEntry[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // PDF page range state
    const [pdfPageRange, setPdfPageRange] = useState<PdfPageRange>({
        raw: '',
        isValid: true,
        errorMsg: '',
        totalPages: null,
        resolvedPages: [],
    });
    const [isDetectingPages, setIsDetectingPages] = useState(false);

    const config: CobookConfig = cobookConfig as CobookConfig;
    const baseUrl = config.base_url.replace(/\/+$/, '');
    const configError: string | null = !config.token ? 'Token порожній в cobook.json. Укажіть валідний API-токен.' : null;

    const [stage, setStage] = useState<FlowStage>('idle');
    const [stageLabel, setStageLabel] = useState('');
    const [progressPercent, setProgressPercent] = useState<number | null>(null);
    const [progressStageLabel, setProgressStageLabel] = useState('');
    const [projectUrl, setProjectUrl] = useState<string | null>(null);
    const [flowError, setFlowError] = useState<string | null>(null);
    const [errorStep, setErrorStep] = useState<FlowStage | null>(null);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const stageRef = useRef<FlowStage>('idle');
    const setStageSafe = (nextStage: FlowStage, label?: string) => {
        stageRef.current = nextStage;
        setStage(nextStage);
        if (label !== undefined) setStageLabel(label);
    };

    const initHashRef = useRef<string | null>(null);
    const uploadIdRef = useRef<string | null>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        if (id) fetchRecord();
        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, [id]);

    const fetchRecord = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('records')
            .select('id, case_title, case_signature, inventory_year, current_settlement_name, current_settlement_type, current_region, current_district, current_community, cobook_link, scans_url')
            .eq('id', id)
            .single();
        setRecord(error || !data ? null : data);
        setLoading(false);
    };

    // ---------------------------------------------------------------------------
    // File selection / drag-drop
    // ---------------------------------------------------------------------------
    const addFiles = useCallback((incoming: File[]) => {
        setFiles(prev => {
            const map = new Map(prev.map(e => [`${e.file.name}::${e.file.size}`, e]));
            incoming.forEach(f => {
                const key = `${f.name}::${f.size}`;
                if (!map.has(key)) map.set(key, { file: f, status: 'pending' });
            });
            return Array.from(map.values());
        });

        // If a PDF is among the incoming files, detect its page count
        const pdf = incoming.find(isPdf);
        if (pdf) {
            detectAndSetPdfPages(pdf);
        }
    }, []);

    const detectAndSetPdfPages = async (pdf: File) => {
        setIsDetectingPages(true);
        setPdfPageRange({ raw: '', isValid: true, errorMsg: '', totalPages: null, resolvedPages: [] });
        const total = await detectPdfPageCount(pdf);
        setIsDetectingPages(false);
        setPdfPageRange(prev => ({ ...prev, totalPages: total }));
    };

    const handlePageRangeChange = (raw: string) => {
        const totalPages = pdfPageRange.totalPages;
        if (!raw.trim()) {
            setPdfPageRange(prev => ({ ...prev, raw, isValid: true, errorMsg: '', resolvedPages: [] }));
            return;
        }
        if (totalPages === null) {
            setPdfPageRange(prev => ({ ...prev, raw, isValid: true, errorMsg: '', resolvedPages: [] }));
            return;
        }
        const { pages, error } = parsePageRange(raw, totalPages);
        setPdfPageRange(prev => ({
            ...prev,
            raw,
            isValid: error === '',
            errorMsg: error,
            resolvedPages: pages,
        }));
    };

    const removeFile = (index: number) => {
        setFiles(prev => {
            const removed = prev[index];
            const next = prev.filter((_, i) => i !== index);
            // If we removed the PDF, reset range state
            if (removed && isPdf(removed.file)) {
                setPdfPageRange({ raw: '', isValid: true, errorMsg: '', totalPages: null, resolvedPages: [] });
            }
            return next;
        });
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        if (e.dataTransfer?.files?.length) addFiles(Array.from(e.dataTransfer.files));
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); };

    const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.length) addFiles(Array.from(e.target.files));
        e.target.value = '';
    };

    // ---------------------------------------------------------------------------
    // Validation
    // ---------------------------------------------------------------------------
    const hasPdf = files.some(e => isPdf(e.file));
    const validationErrors: string[] = [];
    if (hasPdf && files.length > 1) validationErrors.push('PDF має бути єдиним файлом у виборі.');
    if (!pdfPageRange.isValid) validationErrors.push(pdfPageRange.errorMsg);

    const canStart =
        files.length > 0 &&
        validationErrors.length === 0 &&
        !!config?.token &&
        stage === 'idle' &&
        !isDetectingPages;

    // ---------------------------------------------------------------------------
    // API helpers
    // ---------------------------------------------------------------------------
    const apiPost = async (path: string, body: any) => {
        const url = `${baseUrl}${path}`;
        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': `Bearer ${config.token}` },
            body: JSON.stringify(body),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
            const errorCode = extractErrorCode(data);
            throw new Error(errorCode ? getErrorMessage(path, errorCode) : 'Виникли технічні проблеми при створенні проєкту. Повторіть спробу пізніше');
        }
        return data;
    };

    const apiGet = async (path: string) => {
        const url = `${baseUrl}${path}`;
        const resp = await fetch(url, { headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${config.token}` } });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
            const errorCode = extractErrorCode(data);
            throw new Error(errorCode ? getErrorMessage(path, errorCode) : 'Виникли технічні проблеми при створенні проєкту. Повторіть спробу пізніше');
        }
        return data;
    };

    const apiUploadFile = async (uploadId: string, file: File, index: number, initHash: string) => {
        const path = `/api/uploads/${uploadId}/file`;
        const url = `${baseUrl}${path}`;
        const fd = new FormData();
        fd.append('file', file, file.name);
        fd.append('index', String(index));
        fd.append('init_hash', initHash);
        const resp = await fetch(url, { method: 'POST', headers: { 'Authorization': `Bearer ${config.token}` }, body: fd });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
            const errorCode = extractErrorCode(data);
            throw new Error(errorCode ? getErrorMessage(path, errorCode) : 'Виникли технічні проблеми при створенні проєкту. Повторіть спробу пізніше');
        }
        return data;
    };

    const apiUploadChunk = async (uploadId: string, chunk: Blob, chunkIndex: number, totalChunks: number, fileName: string, totalBytes: number, initHash: string) => {
        const path = `/api/uploads/${uploadId}/chunk`;
        const url = `${baseUrl}${path}`;
        const fd = new FormData();
        fd.append('chunk', chunk, fileName);
        fd.append('chunk_index', String(chunkIndex));
        fd.append('total_chunks', String(totalChunks));
        fd.append('file_name', fileName);
        fd.append('total_bytes', String(totalBytes));
        fd.append('init_hash', initHash);
        const resp = await fetch(url, { method: 'POST', headers: { 'Authorization': `Bearer ${config.token}` }, body: fd });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
            const errorCode = extractErrorCode(data);
            throw new Error(errorCode ? getErrorMessage(path, errorCode) : 'Виникли технічні проблеми при створенні проєкту. Повторіть спробу пізніше');
        }
        return data;
    };

    // ---------------------------------------------------------------------------
    // Main flow
    // ---------------------------------------------------------------------------
    const setFileStatus = (index: number, status: UploadStatus, error?: string) => {
        setFiles(prev => prev.map((e, i) => (i === index ? { ...e, status, error } : e)));
    };

    const runFlow = async () => {
        if (record?.cobook_link) {
            setToast({ message: 'Проект транскрибування для цього інвентарного опису вже створено.', type: 'error' });
            return;
        }

        setFlowError(null);
        setProjectUrl(null);
        setProgressPercent(null);
        setProgressStageLabel('');

        try {
            // 1. POST /api/projects/init
            setStageSafe('init', STAGE_LABELS['init']);
            const settlement = record?.current_settlement_name || '';
            const caseSignature = record?.case_signature || '';
            const titleBase = settlement ? `Інвентар: ${settlement}` : 'Інвентар';
            const title = caseSignature ? `${titleBase} (${caseSignature})` : titleBase;
            const initResp = await apiPost('/api/projects/init', {
                source: 'inventarium',
                meta: {
                    title, settlement, cipher: caseSignature,
                    date: record?.inventory_year ? String(record.inventory_year) : null,
                    source_link: record?.scans_url || null,
                },
            });
            const initHash: string = initResp.init_hash;
            initHashRef.current = initHash;

            // 2. POST /api/uploads/init
            setStageSafe('upload-init', STAGE_LABELS['upload-init']);

            // Prepare PDF file — slice if page range is specified
            let pdfFileToUpload: File | null = null;
            if (hasPdf) {
                const pdfIndex = files.findIndex(e => isPdf(e.file));
                const originalPdf = files[pdfIndex].file;
                const hasRange = pdfPageRange.resolvedPages.length > 0;
                if (hasRange) {
                    setStageSafe('upload-init', 'Підготовка PDF: вирізання сторінок…');
                    pdfFileToUpload = await slicePdf(originalPdf, pdfPageRange.resolvedPages);
                } else {
                    pdfFileToUpload = originalPdf;
                }
            }

            const totalBytes = pdfFileToUpload
                ? pdfFileToUpload.size
                : files.reduce((sum, e) => sum + e.file.size, 0);

            const uploadInitResp = await apiPost('/api/uploads/init', {
                expected_files_count: hasPdf ? 1 : files.length,
                total_bytes_expected: totalBytes,
                init_hash: initHash,
                source: 'inventarium',
            });
            const uploadId: string = uploadInitResp.upload_id;
            uploadIdRef.current = uploadId;

            // 3. Upload files
            setStageSafe('uploading', STAGE_LABELS['uploading']);

            if (hasPdf && pdfFileToUpload) {
                const pdfIndex = files.findIndex(e => isPdf(e.file));
                setFileStatus(pdfIndex, 'uploading');

                const chunkSizeMb = config?.chunk_size_mb || 50;
                const chunkSize = chunkSizeMb * 1024 * 1024;
                const totalChunks = Math.ceil(pdfFileToUpload.size / chunkSize);

                for (let i = 0; i < totalChunks; i++) {
                    const start = i * chunkSize;
                    const end = Math.min(start + chunkSize, pdfFileToUpload.size);
                    const chunk = pdfFileToUpload.slice(start, end);
                    await apiUploadChunk(uploadId, chunk, i, totalChunks, pdfFileToUpload.name, pdfFileToUpload.size, initHash);
                }

                await new Promise(resolve => setTimeout(resolve, 1000));
                setFileStatus(pdfIndex, 'done');
            } else {
                for (let i = 0; i < files.length; i++) {
                    setFileStatus(i, 'uploading');
                    await apiUploadFile(uploadId, files[i].file, i, initHash);
                    setFileStatus(i, 'done');
                }
            }

            // 4. Finalize
            setStageSafe('finalizing', STAGE_LABELS['finalizing']);
            await apiPost(`/api/uploads/${uploadId}/finalize`, { init_hash: initHash });

            // 5. Poll upload status
            setStageSafe('polling', 'Очікування готовності завантаження…');
            let uploadReady = false;
            let attempts = 0;
            const maxAttempts = 60;
            while (!uploadReady && attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 2000));
                try {
                    const statusResp = await apiGet(`/api/uploads/${uploadId}/status?init_hash=${initHash}`);
                    if (statusResp.status === 'ready') {
                        uploadReady = true;
                    } else if (statusResp.status === 'failed') {
                        throw new Error('Завантаження не вдалося: ' + (statusResp.error || 'невідома помилка'));
                    }
                } catch (err: any) {
                    if (err.message.includes('Завантаження не вдалося')) throw err;
                }
                attempts++;
            }
            if (!uploadReady) throw new Error('Час очікування готовності завантаження вичерпано');

            // 6. Confirm
            setStageSafe('confirming', STAGE_LABELS['confirming']);
            const confirmResp = await apiPost('/api/projects/confirm', { init_hash: initHash, upload_id: uploadId });
            applyStatus(confirmResp);

            // 7. Poll project status
            setStageSafe('polling', STAGE_LABELS['polling']);
            startPolling();

        } catch (err: any) {
            console.error('Cobook flow error:', err);
            setErrorStep(stageRef.current);
            setStageSafe('error', STAGE_LABELS['error']);
            setFlowError(err.message || 'Виникли технічні проблеми при створенні проєкту. Повторіть спробу пізніше');
            setFiles(prev => prev.map(e => (e.status === 'uploading' ? { ...e, status: 'error' } : e)));
        }
    };

    const saveCobookLink = async (projectUrl: string) => {
        try {
            const url = new URL(projectUrl);
            const cobookLink = url.pathname.replace(/^\//, '');
            await supabase.from('records').update({ cobook_link: cobookLink }).eq('id', id);
        } catch (err) {
            console.error('Помилка при записі cobook_link:', err);
        }
    };

    const applyStatus = (payload: any) => {
        if (payload?.project_url || payload?.status === 'project_created' || payload?.status === 'completed') {
            if (payload.project_direct_url) saveCobookLink(payload.project_direct_url);
            if (payload.project_url) setProjectUrl(payload.project_url);
            setStageSafe('done', STAGE_LABELS['done']);
            setProgressPercent(100);
            setProgressStageLabel('');
            if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
            return;
        }
        if (payload?.status === 'failed') {
            setErrorStep(stageRef.current);
            setStageSafe('error', STAGE_LABELS['error']);
            setFlowError(getFriendlyError(stageRef.current));
            if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
            return;
        }
        setProgressPercent(payload?.progress_percent ?? null);
        setProgressStageLabel(STAGE_PROGRESS_LABELS[payload?.progress_stage] || payload?.progress_stage || '');
    };

    const startPolling = () => {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = setInterval(async () => {
            if (!initHashRef.current) return;
            try {
                const resp = await apiGet(`/api/projects/confirm/status?init_hash=${initHashRef.current}`);
                applyStatus(resp);
            } catch { /* silent */ }
        }, 2000);
    };

    const resetFlow = () => {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        initHashRef.current = null;
        uploadIdRef.current = null;
        setStageSafe('idle', '');
        setProgressPercent(null);
        setProgressStageLabel('');
        setProjectUrl(null);
        setFlowError(null);
        setErrorStep(null);
        setFiles(prev => prev.map(e => ({ ...e, status: 'pending', error: undefined })));
    };

    // ---------------------------------------------------------------------------
    // Render helpers
    // ---------------------------------------------------------------------------
    const totalSize = files.reduce((sum, e) => sum + e.file.size, 0);
    const isDone = stage === 'done';
    const isRunning = ['init', 'upload-init', 'uploading', 'finalizing', 'confirming', 'polling'].includes(stage);
    const isError = stage === 'error';

    const projectTitleDisplay = (() => {
        const settlement = record?.current_settlement_name || '';
        const caseSignature = record?.case_signature || '';
        const titleBase = settlement ? `Інвентар: ${settlement}` : 'Інвентар';
        return caseSignature ? `${titleBase} (${caseSignature})` : titleBase;
    })();

    // PDF page range summary text
    const pdfRangeSummary = (() => {
        if (!hasPdf) return null;
        if (pdfPageRange.totalPages === null) return null;
        if (!pdfPageRange.raw.trim()) return null;
        if (!pdfPageRange.isValid) return null;
        const count = pdfPageRange.resolvedPages.length;
        const total = pdfPageRange.totalPages;
        return `${count} з ${total} стор.`;
    })();

    // ---------------------------------------------------------------------------
    // Render
    // ---------------------------------------------------------------------------
    if (loading) return <p className="p-4 text-gray-900 dark:text-white">Завантаження...</p>;
    if (!record) return <p className="p-4 text-gray-900 dark:text-white">Запис не знайдено</p>;

    return (
        <>
            <Header />
            <main className="min-h-screen bg-white dark:bg-[#111827]">
                <div className="max-w-[1440px] mx-auto px-4 md:px-8 lg:px-[50px] py-[20px] lg:py-[30px]">

                    {/* Back link */}
                    <button
                        onClick={() => router.push(`/record/${id}`)}
                        className="flex items-center gap-[6px] text-gray-700 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white text-[14px] transition-colors mb-[20px]"
                    >
                        <ArrowLeft className="w-4 h-4" strokeWidth={1.8} />
                        <span>Назад до запису</span>
                    </button>

                    {/* Page title */}
                    <div className="flex flex-wrap items-baseline gap-[12px] mb-[24px] lg:mb-[30px]">
                        <h1 className="text-gray-900 dark:text-[#F3F4F6] text-[24px] md:text-[28px] lg:text-[32px] font-bold">
                            Створення проекту транскрибування інвентаря в CoBook
                        </h1>
                    </div>

                    <div className="flex flex-col lg:flex-row gap-[20px] lg:gap-[30px]">

                        {/* ============================================================
                            LEFT — record info + file upload
                            ============================================================ */}
                        <div className="flex-1 flex flex-col gap-[20px]">

                            {/* Record info card */}
                            <div className="p-[20px] lg:p-[24px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937] flex flex-col gap-[16px]">
                                <div className="flex items-center gap-[10px]">
                                    <BookOpen className="w-5 h-5 text-gray-900 dark:text-[#F3F4F6] flex-shrink-0" strokeWidth={2} />
                                    <h2 className="text-gray-900 dark:text-[#F3F4F6] text-[18px] lg:text-[20px] font-semibold">
                                        {record.case_title || 'Інвентарний опис'}
                                    </h2>
                                </div>
                                <div className="flex flex-col gap-[14px]">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-[20px] gap-y-[14px] mt-[25px]">
                                        <div className="flex flex-col gap-[4px]">
                                            <p className="text-gray-700 dark:text-white text-[13px] lg:text-[14px] opacity-80">Назва проекту</p>
                                            <p className="text-gray-900 dark:text-white text-[15px] lg:text-[16px] font-medium">{projectTitleDisplay}</p>
                                        </div>
                                        <div className="flex flex-col gap-[4px]">
                                            <p className="text-gray-700 dark:text-white text-[13px] lg:text-[14px] opacity-80">Сигнатура</p>
                                            <p className="text-gray-900 dark:text-white text-[15px] lg:text-[16px] font-medium">{record.case_signature || '—'}</p>
                                        </div>
                                        <div className="flex flex-col gap-[4px]">
                                            <p className="text-gray-700 dark:text-white text-[13px] lg:text-[14px] opacity-80">Рік складання</p>
                                            <p className="text-gray-900 dark:text-white text-[15px] lg:text-[16px] font-medium">{record.inventory_year || '—'}</p>
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-[4px] mt-[25px]">
                                        <p className="text-gray-700 dark:text-white text-[13px] lg:text-[14px] opacity-80">Населений пункт (сучасний адмінподіл)</p>
                                        <p className="text-gray-900 dark:text-white text-[15px] lg:text-[16px] font-medium">
                                            {[
                                                record.current_region ? `${record.current_region} область` : null,
                                                record.current_district ? `${record.current_district} район` : null,
                                                record.current_community ? `${record.current_community} громада` : null,
                                                record.current_settlement_type && record.current_settlement_name
                                                    ? `${record.current_settlement_type} ${record.current_settlement_name}` : null,
                                            ].filter(Boolean).join(', ') || '—'}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Config error */}
                            {configError && (
                                <div className="flex items-start gap-[10px] px-[12px] py-[10px] rounded bg-[#FEE2E2] dark:bg-[#880E16]">
                                    <AlertTriangle className="w-4 h-4 text-[#880E16] dark:text-[#FEE2E2] flex-shrink-0 mt-0.5" strokeWidth={1.6} />
                                    <p className="text-[#880E16] dark:text-[#FEE2E2] text-[14px]">{configError}</p>
                                </div>
                            )}

                            {/* Drop zone */}
                            <div
                                onDrop={handleDrop}
                                onDragOver={handleDragOver}
                                onClick={() => fileInputRef.current?.click()}
                                className={`border-2 border-dashed rounded-lg p-[24px] lg:p-[30px] text-center cursor-pointer transition-colors
                                    ${isRunning || isDone
                                        ? 'border-gray-200 dark:border-[#374151] opacity-50 pointer-events-none'
                                        : 'border-gray-300 dark:border-[#374151] hover:border-[#2563EB] dark:hover:border-[#3B82F6] bg-gray-50 dark:bg-[#1F2937]'
                                    }
                                `}
                            >
                                <Upload className="w-6 h-6 text-gray-400 dark:text-gray-500 mx-auto mb-[8px]" strokeWidth={1.6} />
                                <p className="text-gray-900 dark:text-[#F3F4F6] text-[15px] lg:text-[16px] font-medium">
                                    Перетягніть файли сюди або натисніть для вибору
                                </p>
                                <p className="text-gray-700 dark:text-white text-[13px] lg:text-[14px] opacity-60 mt-[4px]">
                                    JPG, PNG, TIFF або один PDF
                                </p>
                                <div className="mt-[16px] pt-[16px] border-t border-gray-300 dark:border-[#374151]">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-[16px] gap-y-[6px] max-w-[500px] mx-auto">
                                        <div className="flex items-start gap-[6px]">
                                            <span className="w-1 h-1 rounded-full bg-gray-400 dark:bg-gray-500 mt-[5px] flex-shrink-0"></span>
                                            <p className="text-gray-700 dark:text-white text-[12px] opacity-70">До 500 файлів за сесію</p>
                                        </div>
                                        <div className="flex items-start gap-[6px]">
                                            <span className="w-1 h-1 rounded-full bg-gray-400 dark:bg-gray-500 mt-[5px] flex-shrink-0"></span>
                                            <p className="text-gray-700 dark:text-white text-[12px] opacity-70">Кожен файл до 20 МБ</p>
                                        </div>
                                        <div className="flex items-start gap-[6px]">
                                            <span className="w-1 h-1 rounded-full bg-gray-400 dark:bg-gray-500 mt-[5px] flex-shrink-0"></span>
                                            <p className="text-gray-700 dark:text-white text-[12px] opacity-70">Сумарний розмір до 100 МБ</p>
                                        </div>
                                        <div className="flex items-start gap-[6px]">
                                            <span className="w-1 h-1 rounded-full bg-gray-400 dark:bg-gray-500 mt-[5px] flex-shrink-0"></span>
                                            <p className="text-gray-700 dark:text-white text-[12px] opacity-70">Формати: JPG, PNG, TIF/TIFF, PDF</p>
                                        </div>
                                    </div>
                                </div>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    multiple
                                    accept=".jpg,.jpeg,.png,.tif,.tiff,.pdf"
                                    onChange={handleFileInput}
                                    className="hidden"
                                />
                            </div>

                            {/* ============================================================
                                PDF PAGE RANGE SELECTOR
                                Shown only when a PDF is in the file list
                                ============================================================ */}
                            {hasPdf && !isRunning && !isDone && (
                                <div className="p-[16px] lg:p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937] flex flex-col gap-[14px]">
                                    <div className="flex items-center gap-[10px]">
                                        <Scissors className="w-4 h-4 text-gray-900 dark:text-[#F3F4F6] flex-shrink-0" strokeWidth={2} />
                                        <h3 className="text-gray-900 dark:text-[#F3F4F6] text-[15px] lg:text-[16px] font-semibold">
                                            Діапазон сторінок PDF
                                        </h3>
                                        {isDetectingPages && (
                                            <Loader2 className="w-4 h-4 text-[#2563EB] animate-spin ml-auto" strokeWidth={2} />
                                        )}
                                        {pdfPageRange.totalPages !== null && !isDetectingPages && (
                                            <span className="ml-auto text-gray-500 dark:text-gray-400 text-[13px]">
                                                Всього {pdfPageRange.totalPages} стор.
                                            </span>
                                        )}
                                    </div>

                                    <p className="text-gray-700 dark:text-white text-[13px] opacity-70 -mt-[4px]">
                                        Якщо потрібні лише певні сторінки, вкажіть їх нижче. Перед відправкою PDF буде автоматично обрізано.
                                        Залиште поле порожнім, щоб завантажити весь файл.
                                    </p>

                                    <div className="flex flex-col gap-[6px]">
                                        <label className="text-gray-700 dark:text-white text-[13px] opacity-80 font-medium">
                                            Сторінки (наприклад: 1-50 або 1, 3, 5-10)
                                        </label>
                                        <input
                                            type="text"
                                            value={pdfPageRange.raw}
                                            onChange={e => handlePageRangeChange(e.target.value)}
                                            disabled={isDetectingPages || pdfPageRange.totalPages === null}
                                            placeholder={
                                                isDetectingPages
                                                    ? 'Читаємо PDF…'
                                                    : pdfPageRange.totalPages !== null
                                                        ? `1–${pdfPageRange.totalPages}`
                                                        : 'Не вдалося визначити кількість сторінок'
                                            }
                                            className={`w-full max-w-[320px] px-[12px] h-[38px] rounded border text-[14px] bg-white dark:bg-[#111827] text-gray-900 dark:text-white outline-none transition-colors
                                                placeholder:text-gray-400 dark:placeholder:text-gray-600
                                                ${pdfPageRange.isValid
                                                    ? 'border-gray-300 dark:border-[#374151] focus:border-[#2563EB] dark:focus:border-[#3B82F6]'
                                                    : 'border-[#DC2626] dark:border-[#DC2626] focus:border-[#DC2626]'
                                                }
                                                ${isDetectingPages || pdfPageRange.totalPages === null ? 'opacity-50 cursor-not-allowed' : ''}
                                            `}
                                        />

                                        {/* Validation error */}
                                        {!pdfPageRange.isValid && pdfPageRange.errorMsg && (
                                            <p className="text-[#DC2626] dark:text-[#FCA5A5] text-[12px]">{pdfPageRange.errorMsg}</p>
                                        )}

                                        {/* Summary badge */}
                                        {pdfRangeSummary && (
                                            <div className="flex items-center gap-[6px] mt-[2px]">
                                                <CheckCircle className="w-3.5 h-3.5 text-[#16A34A]" strokeWidth={2} />
                                                <p className="text-[#16A34A] dark:text-[#86EFAC] text-[12px] font-medium">
                                                    Буде завантажено {pdfRangeSummary}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* File list */}
                            {files.length > 0 && (
                                <div className="p-[16px] lg:p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937] flex flex-col gap-[12px]">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-[10px]">
                                            <FileText className="w-4 h-4 text-gray-900 dark:text-[#F3F4F6]" strokeWidth={2} />
                                            <h3 className="text-gray-900 dark:text-[#F3F4F6] text-[15px] lg:text-[16px] font-semibold">
                                                Файли
                                            </h3>
                                        </div>
                                        <p className="text-gray-700 dark:text-white text-[13px] opacity-60">
                                            {files.length} файл{files.length === 1 ? '' : files.length < 5 ? 'и' : 'ів'} · {formatBytes(totalSize)}
                                        </p>
                                    </div>

                                    {/* Validation error */}
                                    {validationErrors.length > 0 && (
                                        <div className="flex items-start gap-[8px] px-[10px] py-[8px] rounded bg-[#FEE2E2] dark:bg-[#880E16]">
                                            <AlertTriangle className="w-4 h-4 text-[#880E16] dark:text-[#FEE2E2] flex-shrink-0 mt-0.5" strokeWidth={1.6} />
                                            <p className="text-[#880E16] dark:text-[#FEE2E2] text-[13px]">{validationErrors[0]}</p>
                                        </div>
                                    )}

                                    <div className="flex flex-col gap-[1px]">
                                        {files.map((entry, i) => (
                                            <div
                                                key={`${entry.file.name}::${entry.file.size}`}
                                                className="flex items-center gap-[10px] px-[10px] py-[8px] rounded hover:bg-gray-100 dark:hover:bg-[#374151] transition-colors"
                                            >
                                                <div className="w-[18px] flex items-center justify-center flex-shrink-0">
                                                    {entry.status === 'uploading' && <Loader2 className="w-4 h-4 text-[#2563EB] animate-spin" strokeWidth={2} />}
                                                    {entry.status === 'done' && <CheckCircle className="w-4 h-4 text-[#16A34A]" strokeWidth={2} />}
                                                    {entry.status === 'error' && <AlertTriangle className="w-4 h-4 text-[#DC2626]" strokeWidth={2} />}
                                                    {entry.status === 'pending' && (
                                                        <span className="w-2 h-2 rounded-full bg-gray-300 dark:bg-[#374151]"></span>
                                                    )}
                                                </div>

                                                <div className="flex-1 min-w-0">
                                                    <p className="text-gray-900 dark:text-white text-[14px] font-medium truncate">{entry.file.name}</p>
                                                    <p className="text-gray-700 dark:text-white text-[12px] opacity-60">
                                                        {formatBytes(entry.file.size)} · {isPdf(entry.file) ? 'PDF' : 'Зображення'}
                                                        {/* Show sliced size hint */}
                                                        {isPdf(entry.file) && pdfRangeSummary && entry.status === 'pending' && (
                                                            <span className="ml-[6px] text-[#2563EB] dark:text-[#60A5FA]">
                                                                → {pdfRangeSummary}
                                                            </span>
                                                        )}
                                                    </p>
                                                    {entry.error && (
                                                        <p className="text-[#DC2626] dark:text-[#FCA5A5] text-[12px] mt-[2px]">{entry.error}</p>
                                                    )}
                                                </div>

                                                <span className={`text-[11px] font-medium px-[6px] py-[2px] rounded ${isPdf(entry.file)
                                                    ? 'bg-[#FEE2E2] text-[#DC2626] dark:bg-[#7F1D1D] dark:text-[#FCA5A5]'
                                                    : 'bg-[#DCFCE7] text-[#16A34A] dark:bg-[#14532D] dark:text-[#86EFAC]'
                                                }`}>
                                                    {isPdf(entry.file) ? 'PDF' : 'IMG'}
                                                </span>

                                                {!isRunning && !isDone && (
                                                    <button
                                                        onClick={() => removeFile(i)}
                                                        className="p-[2px] rounded hover:bg-gray-200 dark:hover:bg-[#374151] transition-colors flex-shrink-0"
                                                    >
                                                        <X className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" strokeWidth={2} />
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Action buttons */}
                            <div className="flex flex-wrap items-center gap-[10px]">
                                {!isRunning && !isDone && (
                                    <button
                                        onClick={runFlow}
                                        disabled={!canStart}
                                        className={`flex items-center gap-[8px] px-[15px] h-[40px] rounded transition-colors
                                            ${canStart
                                                ? 'bg-[#2563EB] hover:bg-[#1D4ED8] text-white'
                                                : 'bg-gray-200 dark:bg-[#374151] text-gray-500 dark:text-gray-500 cursor-not-allowed'
                                            }
                                        `}
                                    >
                                        <Upload className="w-4 h-4 flex-shrink-0" strokeWidth={1.6} />
                                        <span className="text-[15px] lg:text-[16px] font-medium">Створити проект</span>
                                    </button>
                                )}

                                {isError && (
                                    <button
                                        onClick={resetFlow}
                                        className="flex items-center gap-[8px] px-[15px] h-[40px] rounded border border-gray-300 dark:border-[#374151] bg-gray-100 dark:bg-[#1F2937] hover:bg-gray-200 dark:hover:bg-[#374151] transition-colors"
                                    >
                                        <span className="text-gray-900 dark:text-[#F3F4F6] text-[15px] lg:text-[16px] font-medium">Повторити</span>
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* ============================================================
                            RIGHT — status sidebar
                            ============================================================ */}
                        <div className="w-full lg:w-[340px] flex flex-col gap-[20px]">

                            {/* Progress card */}
                            {(isRunning || isDone || isError) && (
                                <div className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937] flex flex-col gap-[16px]">
                                    <div className="flex items-center gap-[10px]">
                                        {isRunning && <Loader2 className="w-5 h-5 text-[#2563EB] animate-spin flex-shrink-0" strokeWidth={2} />}
                                        {isDone && <CheckCircle className="w-5 h-5 text-[#16A34A] flex-shrink-0" strokeWidth={2} />}
                                        {isError && <AlertTriangle className="w-5 h-5 text-[#DC2626] flex-shrink-0" strokeWidth={2} />}
                                        <p className={`text-[15px] lg:text-[16px] font-semibold ${
                                            isDone ? 'text-[#16A34A] dark:text-[#86EFAC]' :
                                            isError ? 'text-[#DC2626] dark:text-[#FCA5A5]' :
                                            'text-gray-900 dark:text-[#F3F4F6]'
                                        }`}>
                                            {stageLabel}
                                        </p>
                                    </div>

                                    {progressPercent !== null && (
                                        <div className="flex flex-col gap-[6px]">
                                            <div className="w-full h-[6px] bg-gray-200 dark:bg-[#374151] rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full transition-all duration-300 ${isDone ? 'bg-[#16A34A]' : 'bg-[#2563EB]'}`}
                                                    style={{ width: `${Math.min(100, progressPercent)}%` }}
                                                />
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <p className="text-gray-700 dark:text-white text-[13px] opacity-60">{progressStageLabel}</p>
                                                <p className="text-gray-900 dark:text-white text-[13px] font-medium">{progressPercent}%</p>
                                            </div>
                                        </div>
                                    )}

                                    {flowError && (
                                        <div className="px-[10px] py-[8px] rounded bg-[#FEE2E2] dark:bg-[#880E16]">
                                            <p className="text-[#880E16] dark:text-[#FEE2E2] text-[13px]">{flowError}</p>
                                        </div>
                                    )}

                                    {isDone && projectUrl && (
                                        <a
                                            href={projectUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="flex items-center justify-center gap-[8px] w-full px-[15px] h-[40px] rounded bg-[#16A34A] hover:bg-[#15803D] transition-colors"
                                        >
                                            <BookOpen className="w-4 h-4 text-white flex-shrink-0" strokeWidth={1.6} />
                                            <span className="text-white text-[15px] lg:text-[16px] font-medium">Перейти до проекту</span>
                                        </a>
                                    )}
                                </div>
                            )}

                            {/* Steps checklist */}
                            <div className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937] flex flex-col gap-[14px]">
                                <h3 className="text-gray-900 dark:text-[#F3F4F6] text-[15px] lg:text-[16px] font-semibold">Кроки створення</h3>

                                {STAGE_STEPS.map((step, i) => {
                                    const stageOrder = ['idle', 'init', 'upload-init', 'uploading', 'finalizing', 'confirming', 'polling', 'done', 'error'];
                                    const currentIdx = stageOrder.indexOf(stage === 'error' ? 'error' : stage);
                                    const stepIdx = stageOrder.indexOf(step.key);
                                    const errorStepIdx = errorStep ? stageOrder.indexOf(errorStep) : -1;

                                    const isStepError = stage === 'error' && errorStep === step.key;
                                    const isCurrent = !isStepError && stage === step.key && stage !== 'done';
                                    const isCompleted = !isStepError && (currentIdx > stepIdx || (stage === 'done' && step.key === 'done'));
                                    const shouldBeGray = stage === 'error' && errorStepIdx !== -1 && stepIdx > errorStepIdx;

                                    return (
                                        <div key={step.key} className="flex items-center gap-[10px]">
                                            <div className={`w-[20px] h-[20px] rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold
                                                ${isStepError ? 'bg-[#DC2626] text-white' :
                                                  shouldBeGray ? 'bg-gray-200 dark:bg-[#374151] text-gray-500 dark:text-gray-500' :
                                                  isCompleted ? 'bg-[#16A34A] text-white' :
                                                  isCurrent ? 'bg-[#2563EB] text-white' :
                                                  'bg-gray-200 dark:bg-[#374151] text-gray-500 dark:text-gray-500'}
                                            `}>
                                                {isStepError ? '✕' : isCompleted ? '✓' : i + 1}
                                            </div>
                                            <p className={`text-[14px] ${
                                                isStepError ? 'text-[#DC2626] dark:text-[#FCA5A5]' :
                                                shouldBeGray ? 'text-gray-500 dark:text-gray-500' :
                                                isCompleted ? 'text-[#16A34A] dark:text-[#86EFAC]' :
                                                isCurrent ? 'text-gray-900 dark:text-[#F3F4F6] font-medium' :
                                                'text-gray-500 dark:text-gray-500'
                                            }`}>
                                                {step.label}
                                            </p>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} duration={4000} />}
        </>
    );
}
