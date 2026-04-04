import React from 'react';

interface ModalProps {
  isOpen: boolean;
  title?: string;
  onClose?: () => void;
  children: React.ReactNode;
}

export default function Modal({ isOpen, title, onClose, children }: ModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/85 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="p-5 rounded-[10px] flex flex-col gap-[10px] min-w-[250px]"
        onClick={(e) => e.stopPropagation()}
      >
        {title && <p className="text-center m-0">{title}</p>}
        {children}
      </div>
    </div>
  );
}
