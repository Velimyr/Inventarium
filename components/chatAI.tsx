import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { useUser } from "../contexts/UserContext";
import ReactMarkdown from "react-markdown";

type Message = {
    role: "user" | "assistant";
    content: string;
};

interface ChatAIProps {
    isOpen: boolean;
    onClose?: () => void;
}

export default function ChatAI({ isOpen, onClose }: ChatAIProps) {
    const { user } = useUser();
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const chatEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    if (!isOpen) return null;

    const sendMessage = async () => {
        if (!input.trim()) return;
        const userMessage: Message = { role: "user", content: input.trim() };
        setMessages((prev) => [...prev, userMessage]);
        setInput("");
        setLoading(true);

        try {
            const response = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query: input.trim() }),
            });
            const data = await response.json().catch(() => null);

            const botMessage: Message = {
                role: "assistant",
                content: data?.answer || "Не вдалося отримати відповідь 😔",
            };
            setMessages((prev) => [...prev, botMessage]);
        } catch (error) {
            setMessages((prev) => [
                ...prev,
                { role: "assistant", content: "⚠️ Виникла помилка при отриманні відповіді." },
            ]);
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    const renderMessage = (msg: Message, idx: number) => {
        const baseStyle = "inline-block px-3 py-2 rounded-xl break-words max-w-[75%] text-sm";
        const userStyle = "bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-right";
        const assistantStyle = "bg-blue-100 dark:bg-blue-800 text-gray-900 dark:text-gray-100 text-left";

        return (
            <div key={idx} className={`mb-2 flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <span className={`${baseStyle} ${msg.role === "user" ? userStyle : assistantStyle}`}>
                    {msg.role === "assistant" ? (
                        <ReactMarkdown
                            components={{
                                a: ({ node, ...props }) => (
                                    <a
                                        {...props}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="underline text-blue-600 dark:text-blue-400"
                                    />
                                ),
                            }}
                        >
                            {msg.content}
                        </ReactMarkdown>
                    ) : (
                        msg.content
                    )}
                </span>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center sm:relative">
            <div className="relative flex flex-col w-full max-w-md h-full sm:h-96 bg-gray-50 dark:bg-gray-900 rounded-xl shadow-lg border border-gray-300 dark:border-gray-600 overflow-hidden">

                {/* Кнопка закриття */}
                {onClose && (
                    <button
                        className="absolute top-3 right-3 z-50 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-xl p-2 shadow-md"
                        onClick={onClose}
                    >
                        ✕
                    </button>
                )}

                {/* Якщо користувач неавторизований */}
                {!user ? (
                    <div className="flex-1 flex items-center justify-center p-6 text-center">
                        <p className="text-gray-600 dark:text-gray-300 text-sm">
                            Для користування AI Асистентом потрібно <span className="font-semibold">авторизуватися</span>.
                        </p>
                    </div>
                ) : (
                    <>
                        {/* Повідомлення */}
                        <div className="flex-1 overflow-y-auto p-3 space-y-1 scrollbar-thin scrollbar-thumb-gray-400 dark:scrollbar-thumb-gray-600 scrollbar-track-gray-200 dark:scrollbar-track-gray-800 hover:scrollbar-thumb-gray-500 dark:hover:scrollbar-thumb-gray-500">
                            {messages.length === 0 ? (
                                <p className="text-sm text-gray-500">Введіть ваше запитання щодо інвентарю</p>
                            ) : (
                                messages.map(renderMessage)
                            )}
                            <div ref={chatEndRef} />
                        </div>

                        {/* Input */}
                        <div className="flex border-t border-gray-300 dark:border-gray-600 p-2 bg-gray-50 dark:bg-gray-900 rounded-b-xl">
                            <input
                                className="flex-1 rounded-l-xl border border-gray-300 dark:border-gray-600 dark:bg-gray-700 px-3 py-2 outline-none text-gray-900 dark:text-gray-100"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Напишіть повідомлення..."
                            />
                            <button
                                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-r-xl flex items-center justify-center"
                                onClick={sendMessage}
                                disabled={loading}
                            >
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    className="w-5 h-5"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
                                </svg>
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
