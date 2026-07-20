import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const Pagination = ({ currentPage, totalPages, onPageChange }) => {
  if (totalPages <= 1) return null;

  const getPageNumbers = () => {
    const pages = [];
    let start = Math.max(2, currentPage - 2);
    let end = Math.min(totalPages - 1, currentPage + 2);

    if (currentPage <= 3) {
      end = Math.min(totalPages - 1, 5);
    }
    if (currentPage >= totalPages - 2) {
      start = Math.max(2, totalPages - 4);
    }

    pages.push(1);
    if (start > 2) pages.push("...");
    for (let i = start; i <= end; i++) pages.push(i);
    if (end < totalPages - 1) pages.push("...");
    if (totalPages > 1) pages.push(totalPages);

    return pages;
  };

  const pages = getPageNumbers();

  return (
    <div className="glass-pagination flex items-center justify-between px-4 py-3 sm:px-6">
      <p className="hidden text-sm text-glass-muted sm:block">
        Page <span className="font-medium theme-text">{currentPage}</span> of{" "}
        <span className="font-medium theme-text">{totalPages}</span>
      </p>

      <nav
        className="pagination-nav inline-flex items-center gap-1 rounded-2xl p-1 backdrop-blur-xl"
        aria-label="Pagination"
      >
        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-medium text-glass-muted transition disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Prev</span>
        </button>

        {pages.map((page, index) =>
          page === "..." ? (
            <span
              key={`ellipsis-${index}`}
              className="px-2 text-sm text-glass-subtle"
            >
              …
            </span>
          ) : (
            <button
              key={page}
              type="button"
              onClick={() => onPageChange(page)}
              className={`min-w-[36px] rounded-xl px-3 py-2 text-sm font-medium transition ${
                page === currentPage
                  ? "pagination-page-active bg-[#0a84ff]/25 text-white shadow-[0_0_12px_rgb(10_132_255/0.3)]"
                  : "text-glass-muted"
              }`}
            >
              {page}
            </button>
          )
        )}

        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-medium text-glass-muted transition disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="h-4 w-4" />
        </button>
      </nav>
    </div>
  );
};

export default Pagination;
