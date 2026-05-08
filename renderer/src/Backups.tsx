import React, { useEffect, useState } from 'react';
import { handleError } from '../lib/error-handler';
import { formatBytes } from '../lib/format';
import type { BackupInfo } from '../../shared/types';
import Modal from './components/Modal';

export default function Backups() {
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [confirming, setConfirming] = useState<BackupInfo | null>(null);

  useEffect(() => {
    window.backup.list().then(setBackups).catch(handleError);
  }, []);

  const handleRestore = async () => {
    if (!confirming) return;
    try {
      await window.backup.restore(confirming.filename);
    } catch (error) {
      handleError(error, 'Restore failed');
      setConfirming(null);
    }
  };

  return (
    <div className="p-5">
      <h2 className="text-center text-[13px] mt-0 mb-[15px]">Database Backups</h2>
      {backups.length === 0 ? (
        <p className="text-center text-gray-400 text-[11px]">No backups yet</p>
      ) : (
        <div className="flex flex-col gap-[6px]">
          {backups.map(b => (
            <div key={b.filename} className="flex items-center justify-between px-3 py-2 rounded bg-surface">
              <div>
                <div className="text-[12px]">{b.date}</div>
                <div className="text-[10px] text-gray-400">{formatBytes(b.sizeBytes)}</div>
              </div>
              <button className="text-[11px]" onClick={() => setConfirming(b)}>Restore</button>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={confirming !== null} title="Restore Backup" onClose={() => setConfirming(null)}>
        <div className="text-center">
          <p className="text-[11px] text-error mb-[10px]">
            This will replace your entire database with the backup from <strong>{confirming?.date}</strong> and restart the app.
          </p>
          <p className="text-[11px] text-gray-400 mb-[15px]">Any entries made after this date will be lost.</p>
          <div className="flex gap-[10px] justify-center">
            <button className="text-[11px]" onClick={() => setConfirming(null)}>Cancel</button>
            <button
              className="text-[11px] bg-error text-white"
              onClick={handleRestore}
            >
              Yes, restore and restart
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
