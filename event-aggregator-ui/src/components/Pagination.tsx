"use client";

import {useState, useEffect} from "react";
import {ChevronLeft, ChevronRight} from "lucide-react";

interface PaginationProps {
    currentPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
}

export default function Pagination({
                                       currentPage,
                                       totalPages,
                                       onPageChange,
                                   }: PaginationProps) {
    const [inputValue, setInputValue] = useState("");

    useEffect(() => {
        setInputValue("");
    }, [currentPage]);

    if (totalPages <= 1) return null;

    const getPageNumbers = () => {
        const pages: (number | string)[] = [];
        const maxVisible = 9;

        if (totalPages <= maxVisible) {
            for (let i = 1; i <= totalPages; i++) {
                pages.push(i);
            }
        } else {
            pages.push(1);
            const siblingCount = 2;
            const start = Math.max(2, currentPage - siblingCount);
            const end = Math.min(totalPages - 1, currentPage + siblingCount);

            if (start > 2) pages.push("...");
            for (let i = start; i <= end; i++) {
                pages.push(i);
            }
            if (end < totalPages - 1) pages.push("...");
            pages.push(totalPages);
        }
        return pages;
    };

    const handleInputSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const num = parseInt(inputValue);
        if (!isNaN(num) && num >= 1 && num <= totalPages) {
            onPageChange(num);
        }
    };

    const pageNumbers = getPageNumbers();

    return (
        <div className="flex flex-wrap items-center justify-center gap-4 mt-12">
            <div
                className="flex items-center gap-2 bg-white/90 backdrop-blur-xl p-2 rounded-2xl border border-violet-200 shadow-md">
                <button
                    onClick={() => onPageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="p-2.5 rounded-xl text-violet-800 hover:bg-violet-100 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
                    title="Previous"
                >
                    <ChevronLeft className="h-5 w-5 stroke-[3px]"/>
                </button>

                <div className="flex items-center gap-1">
                    {pageNumbers.map((page, idx) => {
                        if (page === "...") {
                            return (
                                <span key={`ellipsis-${idx}`} className="px-1.5 text-violet-500 font-black">
                                    ...
                                </span>
                            );
                        }

                        const pageNum = page as number;
                        const isActive = pageNum === currentPage;

                        return (
                            <button
                                key={pageNum}
                                onClick={() => onPageChange(pageNum)}
                                className={`min-w-[40px] h-10 rounded-xl text-sm font-black transition-all border ${
                                    isActive
                                        ? "bg-violet-600 text-white shadow-lg shadow-violet-200 border-violet-600"
                                        : "text-violet-900/80 border-transparent hover:border-violet-200 hover:bg-violet-50"
                                }`}
                            >
                                {pageNum}
                            </button>
                        );
                    })}
                </div>

                <button
                    onClick={() => onPageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="p-2.5 rounded-xl text-violet-800 hover:bg-violet-100 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
                    title="Next"
                >
                    <ChevronRight className="h-5 w-5 stroke-[3px]"/>
                </button>
            </div>

            <form
                onSubmit={handleInputSubmit}
                className="flex items-center gap-2 px-3 py-2 bg-white/95 backdrop-blur-xl rounded-2xl border border-violet-200 shadow-md"
            >
                <input
                    type="number"
                    min="1"
                    max={totalPages}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder={currentPage.toString()}
                    className="w-14 h-9 text-center text-sm font-black bg-white border border-violet-200 rounded-xl outline-none focus:ring-2 focus:ring-violet-500 transition-all text-violet-900 placeholder:text-violet-300 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <button
                    type="submit"
                    className="p-2 rounded-xl bg-violet-600 text-white hover:bg-violet-700 disabled:bg-violet-200 transition-all shadow-md"
                    disabled={!inputValue}
                >
                    <ChevronRight className="h-4 w-4 stroke-[3px]"/>
                </button>
            </form>
        </div>
    );
}