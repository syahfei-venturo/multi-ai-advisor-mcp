'use client';

import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDangerous?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isDangerous = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 transition-opacity"
        onClick={onCancel}
      />

      {/* Dialog */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-[var(--card-bg)] rounded-2xl border border-[var(--border)] shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="flex items-center gap-3 px-6 py-4 border-b border-[var(--border)]">
            {isDangerous ? (
              <AlertTriangle size={24} className="text-red-500 flex-shrink-0" />
            ) : (
              <div className="w-6 h-6 rounded-full bg-[var(--accent-primary)] flex-shrink-0" />
            )}
            <h2 className="text-lg font-semibold text-[var(--foreground)]">{title}</h2>
            <button
              onClick={onCancel}
              className="ml-auto w-8 h-8 rounded-full hover:bg-[var(--border)] flex items-center justify-center transition-colors flex-shrink-0"
            >
              <X size={18} className="text-[var(--text-secondary)]" />
            </button>
          </div>

          {/* Content */}
          <div className="px-6 py-4">
            <p className="text-[var(--text-secondary)]">{message}</p>
          </div>

          {/* Footer */}
          <div className="flex gap-3 px-6 py-4 border-t border-[var(--border)] bg-[var(--background)] justify-end">
            <button
              onClick={onCancel}
              className="px-4 py-2 rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--card-bg)] transition-colors font-medium text-sm"
            >
              {cancelText}
            </button>
            <button
              onClick={onConfirm}
              className={`px-4 py-2 rounded-lg font-medium text-sm text-white transition-colors ${
                isDangerous
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600'
              }`}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
