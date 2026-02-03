'use client';

import { useRouter } from 'next/router';
import { supabase } from '../../../lib/supabaseClient';
import Header from '../../../components/header';
import Toast from '../../../components/Toast';
import { useEffect, useState, useRef, useCallback } from 'react';
import { ArrowLeft, Upload, FileText, CheckCircle, AlertTriangle, Loader2, X, BookOpen } from 'lucide-react';
import cobookConfig from '../cobook.json';

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

const STAGE_LABELS: Record<string, string> = {
    idle: '',
    init: 'Ініціалізація сеансу…',
    'upload-init': 'Підготовка завантження…',
    uploading: 'Завантаження файлів…',
    finalizing: 'Фіналізація завантаження…',
    confirming: 'Підтверждення створення проекту…',
    polling: 'Обробка проекту…',
    done: 'Проект створено успішно',
    error: 'Помилка',
};

const STAGE_PROGRESS_LABELS: Record<string, string> = {
    initializing: 'Ініціалізація',
    moving_files: 'Перенесення файлів',
    commands: 'Створення задач',
    completed: 'Завершено',
    error: 'Помилка',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function CobookCreatePage() {
    const router = useRouter();
    const { id } = router.query;

    // record
    const [record, setRecord] = useState<any | null>(null);
    const [loading, setLoading] = useState(true);

    // files
    const [files, setFiles] = useState<FileEntry[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // config
    const config: CobookConfig = cobookConfig as CobookConfig;
    const baseUrl = config.base_url.replace(/\/+$/, '');
    const configError: string | null = !config.token ? 'Token порожній в cobook.json. Укажіть валідний API-токен.' : null;

    // flow
    const [stage, setStage] = useState<FlowStage>('idle');
    const [stageLabel, setStageLabel] = useState('');
    const [progressPercent, setProgressPercent] = useState<number | null>(null);
    const [progressStageLabel, setProgressStageLabel] = useState('');
    const [projectUrl, setProjectUrl] = useState<string | null>(null);
    const [flowError, setFlowError] = useState<string | null>(null);
    const [errorStep, setErrorStep] = useState<FlowStage | null>(null);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    // refs for flow state (avoid stale closures in polling)
    const initHashRef = useRef<string | null>(null);
    const uploadIdRef = useRef<string | null>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // ---------------------------------------------------------------------------
    // Load record on mount
    // ---------------------------------------------------------------------------
    useEffect(() => {
        if (id) fetchRecord();
        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
        };
    }, [id]);

    const fetchRecord = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('records')
            .select('id, case_title, case_signature, inventory_year, current_settlement_name, current_settlement_type, current_region, current_district, current_community, cobook_link, scans_url')
            .eq('id', id)
            .single();
        if (error || !data) {
            setRecord(null);
        } else {
            setRecord(data);
        }
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
                if (!map.has(key)) {
                    map.set(key, { file: f, status: 'pending' });
                }
            });
            return Array.from(map.values());
        });
    }, []);

    const removeFile = (index: number) => {
        setFiles(prev => prev.filter((_, i) => i !== index));
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        if (e.dataTransfer?.files?.length) {
            addFiles(Array.from(e.dataTransfer.files));
        }
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
    };

    const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.length) {
            addFiles(Array.from(e.target.files));
        }
        e.target.value = '';
    };

    // ---------------------------------------------------------------------------
    // Validation
    // ---------------------------------------------------------------------------
    const hasPdf = files.some(e => isPdf(e.file));
    const validationErrors: string[] = [];
    if (hasPdf && files.length > 1) {
        validationErrors.push('PDF має бути єдиним файлом у виборі.');
    }

    const canStart =
        files.length > 0 &&
        validationErrors.length === 0 &&
        !!config?.token &&
        stage === 'idle';

    // ---------------------------------------------------------------------------
    // API helpers — baseUrl + Bearer token из конфига
    // ---------------------------------------------------------------------------
    const apiPost = async (path: string, body: any) => {
        const url = `${baseUrl}${path}`;
        const resp = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': `Bearer ${config.token}`,
            },
            body: JSON.stringify(body),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(`Помилка ${resp.status}: ${data.message || JSON.stringify(data)}`);
        return data;
    };

    const apiGet = async (path: string) => {
        const url = `${baseUrl}${path}`;
        const resp = await fetch(url, {
            headers: {
                'Accept': 'application/json',
                'Authorization': `Bearer ${config.token}`,
            },
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(`Помилка ${resp.status}: ${data.message || JSON.stringify(data)}`);
        return data;
    };

    const apiUploadFile = async (uploadId: string, file: File, index: number, initHash: string) => {
        const url = `${baseUrl}/api/uploads/${uploadId}/file`;
        const fd = new FormData();
        fd.append('file', file, file.name);
        fd.append('index', String(index));
        fd.append('init_hash', initHash);
        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${config.token}` },
            body: fd,
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(`Помилка завантаження ${file.name}: ${resp.status} ${data.message || JSON.stringify(data)}`);
        return data;
    };

    const apiUploadChunk = async (uploadId: string, chunk: Blob, chunkIndex: number, totalChunks: number, fileName: string, totalBytes: number, initHash: string) => {
        const url = `${baseUrl}/api/uploads/${uploadId}/chunk`;
        const fd = new FormData();
        fd.append('chunk', chunk, fileName);
        fd.append('chunk_index', String(chunkIndex));
        fd.append('total_chunks', String(totalChunks));
        fd.append('file_name', fileName);
        fd.append('total_bytes', String(totalBytes));
        fd.append('init_hash', initHash);
        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${config.token}` },
            body: fd,
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(`Помилка чанка ${chunkIndex + 1}/${totalChunks}: ${resp.status} ${data.message || JSON.stringify(data)}`);
        return data;
    };

    // ---------------------------------------------------------------------------
    // Main flow
    // ---------------------------------------------------------------------------
    const setFileStatus = (index: number, status: UploadStatus, error?: string) => {
        setFiles(prev => prev.map((e, i) => (i === index ? { ...e, status, error } : e)));
    };

    const runFlow = async () => {
        // Check if project already exists
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
            setStage('init');
            setStageLabel(STAGE_LABELS['init']);
            const settlement = record?.current_settlement_name || '';
            const caseSignature = record?.case_signature || '';
            const title = settlement && caseSignature
                ? `${settlement} (${caseSignature})`
                : settlement || caseSignature || 'Інвентарний опис';
            const initResp = await apiPost('/api/projects/init', {
                source: 'inventarium',
                meta: {
                    title,
                    settlement,
                    cipher: caseSignature,
                    date: record?.inventory_year ? String(record.inventory_year) : null,
                    source_link: record?.scans_url || null,
                },
            });
            const initHash: string = initResp.init_hash;
            initHashRef.current = initHash;

            // 2. POST /api/uploads/init
            setStage('upload-init');
            setStageLabel(STAGE_LABELS['upload-init']);
            const totalBytes = files.reduce((sum, e) => sum + e.file.size, 0);
            const uploadInitResp = await apiPost('/api/uploads/init', {
                expected_files_count: hasPdf ? 1 : files.length,
                total_bytes_expected: totalBytes,
                init_hash: initHash,
                source: 'inventarium',
            });
            const uploadId: string = uploadInitResp.upload_id;
            uploadIdRef.current = uploadId;

            // 3. Upload files
            setStage('uploading');
            setStageLabel(STAGE_LABELS['uploading']);

            if (hasPdf) {
                const pdfIndex = files.findIndex(e => isPdf(e.file));
                const pdfFile = files[pdfIndex].file;
                setFileStatus(pdfIndex, 'uploading');

                const chunkSizeMb = config?.chunk_size_mb || 50;
                const chunkSize = chunkSizeMb * 1024 * 1024;
                const totalChunks = Math.ceil(pdfFile.size / chunkSize);

                for (let i = 0; i < totalChunks; i++) {
                    const start = i * chunkSize;
                    const end = Math.min(start + chunkSize, pdfFile.size);
                    const chunk = pdfFile.slice(start, end);
                    await apiUploadChunk(uploadId, chunk, i, totalChunks, pdfFile.name, pdfFile.size, initHash);
                }
                
                // Wait a bit to ensure server processed all chunks
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                setFileStatus(pdfIndex, 'done');
            } else {
                for (let i = 0; i < files.length; i++) {
                    setFileStatus(i, 'uploading');
                    await apiUploadFile(uploadId, files[i].file, i, initHash);
                    setFileStatus(i, 'done');
                }
            }

            // 4. POST /api/uploads/{upload_id}/finalize
            setStage('finalizing');
            setStageLabel(STAGE_LABELS['finalizing']);
            await apiPost(`/api/uploads/${uploadId}/finalize`, { init_hash: initHash });

            // 5. Poll upload status until ready
            setStage('polling');
            setStageLabel('Очікування готовності завантаження…');
            let uploadReady = false;
            let attempts = 0;
            const maxAttempts = 60; // 2 minutes max
            
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
                    if (err.message.includes('Завантаження не вдалося')) {
                        throw err;
                    }
                    // Ignore other errors and keep polling
                }
                attempts++;
            }
            
            if (!uploadReady) {
                throw new Error('Час очікування готовності завантаження вичерпано');
            }

            // 6. POST /api/projects/confirm
            setStage('confirming');
            setStageLabel(STAGE_LABELS['confirming']);
            const confirmResp = await apiPost('/api/projects/confirmx', {
                init_hash: initHash,
                upload_id: uploadId,
            });
            applyStatus(confirmResp);

            // 7. Poll project creation status
            setStage('polling');
            setStageLabel(STAGE_LABELS['polling']);
            startPolling();

        } catch (err: any) {
            setErrorStep(stage); // Remember which step failed
            setStage('error');
            setStageLabel(STAGE_LABELS['error']);
            setFlowError(err.message || String(err));
            setFiles(prev => prev.map(e => (e.status === 'uploading' ? { ...e, status: 'error' } : e)));
        }
    };

    const saveCobookLink = async (projectUrl: string) => {
        try {
            // project_url: "https://cobook.today/projects/abc123" → cobook_link: "projects/abc123"
            const url = new URL(projectUrl);
            const cobookLink = url.pathname.replace(/^\//, '');
            await supabase.from('records').update({ cobook_link: cobookLink }).eq('id', id);
        } catch (err) {
            console.error('Помилка при записі cobook_link:', err);
        }
    };

    const applyStatus = (payload: any) => {
        if (payload?.project_url || payload?.status === 'project_created' || payload?.status === 'completed') {
            // Save project_direct_url to database
            if (payload.project_direct_url) {
                saveCobookLink(payload.project_direct_url);
            }
            // Show project_url in the UI button
            if (payload.project_url) {
                setProjectUrl(payload.project_url);
            }
            setStage('done');
            setStageLabel(STAGE_LABELS['done']);
            setProgressPercent(100);
            setProgressStageLabel('');
            if (pollRef.current) {
                clearInterval(pollRef.current);
                pollRef.current = null;
            }
            return;
        }
        if (payload?.status === 'failed') {
            setStage('error');
            setStageLabel(STAGE_LABELS['error']);
            setFlowError(payload?.error_message || 'Неизвестна помилка при створенні проекту.');
            if (pollRef.current) {
                clearInterval(pollRef.current);
                pollRef.current = null;
            }
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
            } catch {
                // silent — keep polling
            }
        }, 2000);
    };

    const resetFlow = () => {
        if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
        }
        initHashRef.current = null;
        uploadIdRef.current = null;
        setStage('idle');
        setStageLabel('');
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
                            Створення проекту в CoBook
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
                                    {/* First row: Project title, Signature, Year */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-[20px] gap-y-[14px]">
                                        <div className="flex flex-col gap-[4px]">
                                            <p className="text-gray-700 dark:text-white text-[13px] lg:text-[14px] opacity-80">Назва проекту</p>
                                            <p className="text-gray-900 dark:text-white text-[15px] lg:text-[16px] font-medium">
                                                {record.current_settlement_name && record.case_signature
                                                    ? `${record.current_settlement_name} (${record.case_signature})`
                                                    : record.current_settlement_name || record.case_signature || '—'}
                                            </p>
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

                                    {/* Second row: Full current administrative division */}
                                    <div className="flex flex-col gap-[4px]">
                                        <p className="text-gray-700 dark:text-white text-[13px] lg:text-[14px] opacity-80">Населений пункт (сучасний адмінподіл)</p>
                                        <p className="text-gray-900 dark:text-white text-[15px] lg:text-[16px] font-medium">
                                            {[
                                                record.current_region ? `${record.current_region} область` : null,
                                                record.current_district ? `${record.current_district} район` : null,
                                                record.current_community ? `${record.current_community} громада` : null,
                                                record.current_settlement_type && record.current_settlement_name
                                                    ? `${record.current_settlement_type} ${record.current_settlement_name}`
                                                    : null,
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
                                    Перетягніть файли сюди або натнатисніть для вибору
                                </p>
                                <p className="text-gray-700 dark:text-white text-[13px] lg:text-[14px] opacity-60 mt-[4px]">
                                    JPG, PNG, TIFF або один PDF
                                </p>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    multiple
                                    accept=".jpg,.jpeg,.png,.tif,.tiff,.pdf"
                                    onChange={handleFileInput}
                                    className="hidden"
                                />
                            </div>

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
                                                {/* status icon */}
                                                <div className="w-[18px] flex items-center justify-center flex-shrink-0">
                                                    {entry.status === 'uploading' && <Loader2 className="w-4 h-4 text-[#2563EB] animate-spin" strokeWidth={2} />}
                                                    {entry.status === 'done' && <CheckCircle className="w-4 h-4 text-[#16A34A]" strokeWidth={2} />}
                                                    {entry.status === 'error' && <AlertTriangle className="w-4 h-4 text-[#DC2626]" strokeWidth={2} />}
                                                    {entry.status === 'pending' && (
                                                        <span className="w-2 h-2 rounded-full bg-gray-300 dark:bg-[#374151]"></span>
                                                    )}
                                                </div>

                                                {/* name + size */}
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-gray-900 dark:text-white text-[14px] font-medium truncate">{entry.file.name}</p>
                                                    <p className="text-gray-700 dark:text-white text-[12px] opacity-60">
                                                        {formatBytes(entry.file.size)} · {isPdf(entry.file) ? 'PDF' : 'Зображення'}
                                                    </p>
                                                    {entry.error && (
                                                        <p className="text-[#DC2626] dark:text-[#FCA5A5] text-[12px] mt-[2px]">{entry.error}</p>
                                                    )}
                                                </div>

                                                {/* badge */}
                                                <span className={`text-[11px] font-medium px-[6px] py-[2px] rounded ${isPdf(entry.file)
                                                    ? 'bg-[#FEE2E2] text-[#DC2626] dark:bg-[#7F1D1D] dark:text-[#FCA5A5]'
                                                    : 'bg-[#DCFCE7] text-[#16A34A] dark:bg-[#14532D] dark:text-[#86EFAC]'
                                                }`}>
                                                    {isPdf(entry.file) ? 'PDF' : 'IMG'}
                                                </span>

                                                {/* remove btn */}
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

                            {/* Progress card — visible once flow started */}
                            {(isRunning || isDone || isError) && (
                                <div className="p-[20px] rounded-lg border border-gray-300 dark:border-[#374151] bg-gray-50 dark:bg-[#1F2937] flex flex-col gap-[16px]">

                                    {/* stage label */}
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

                                    {/* progress bar */}
                                    {progressPercent !== null && (
                                        <div className="flex flex-col gap-[6px]">
                                            <div className="w-full h-[6px] bg-gray-200 dark:bg-[#374151] rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full transition-all duration-300 ${isDone ? 'bg-[#16A34A]' : 'bg-[#2563EB]'}`}
                                                    style={{ width: `${Math.min(100, progressPercent)}%` }}
                                                />
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <p className="text-gray-700 dark:text-white text-[13px] opacity-60">
                                                    {progressStageLabel}
                                                </p>
                                                <p className="text-gray-900 dark:text-white text-[13px] font-medium">
                                                    {progressPercent}%
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    {/* error message */}
                                    {flowError && (
                                        <div className="px-[10px] py-[8px] rounded bg-[#FEE2E2] dark:bg-[#880E16]">
                                            <p className="text-[#880E16] dark:text-[#FEE2E2] text-[13px]">{flowError}</p>
                                        </div>
                                    )}

                                    {/* Success — open project button */}
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

                                {([
                                    { key: 'init', label: 'Ініціалізація сеансу' },
                                    { key: 'upload-init', label: 'Підготовка завантаження' },
                                    { key: 'uploading', label: 'Завантаження файлів' },
                                    { key: 'finalizing', label: 'Фіналізація' },
                                    { key: 'confirming', label: 'Підтверждення' },
                                    { key: 'polling', label: 'Обробка проекту' },
                                    { key: 'done', label: 'Проект створено' },
                                ] as const).map((step, i) => {
                                    const stageOrder = ['idle', 'init', 'upload-init', 'uploading', 'finalizing', 'confirming', 'polling', 'done', 'error'];
                                    const currentIdx = stageOrder.indexOf(stage === 'error' ? 'error' : stage);
                                    const stepIdx = stageOrder.indexOf(step.key);
                                    const errorStepIdx = errorStep ? stageOrder.indexOf(errorStep) : -1;
                                    
                                    const isError = stage === 'error' && errorStep === step.key;
                                    const isCurrent = !isError && stage === step.key && stage !== 'done';
                                    const isCompleted = !isError && (currentIdx > stepIdx || (stage === 'done' && step.key === 'done'));
                                    
                                    // If there's an error, don't mark steps after the error as completed
                                    const shouldBeGray = stage === 'error' && errorStepIdx !== -1 && stepIdx > errorStepIdx;

                                    return (
                                        <div key={step.key} className="flex items-center gap-[10px]">
                                            <div className={`w-[20px] h-[20px] rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold
                                                ${isError
                                                    ? 'bg-[#DC2626] text-white'
                                                    : shouldBeGray
                                                        ? 'bg-gray-200 dark:bg-[#374151] text-gray-500 dark:text-gray-500'
                                                        : isCompleted
                                                            ? 'bg-[#16A34A] text-white'
                                                            : isCurrent
                                                                ? 'bg-[#2563EB] text-white'
                                                                : 'bg-gray-200 dark:bg-[#374151] text-gray-500 dark:text-gray-500'
                                                }
                                            `}>
                                                {isError ? '✕' : isCompleted ? '✓' : i + 1}
                                            </div>
                                            <p className={`text-[14px] ${
                                                isError ? 'text-[#DC2626] dark:text-[#FCA5A5]' :
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