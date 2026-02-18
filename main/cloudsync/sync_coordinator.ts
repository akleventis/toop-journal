import { dbEvents } from '../db/sqlite';
import { updateLocalMasterIndex } from './master_index';

dbEvents.on('entry:created', (event: { id: string; lastModified: number }) => {
    updateLocalMasterIndex(event.id, { lastModified: event.lastModified, deleted: false });
});

dbEvents.on('entry:updated', (event: { id: string; lastModified: number }) => {
    updateLocalMasterIndex(event.id, { lastModified: event.lastModified, deleted: false });
});

dbEvents.on('entry:deleted', (event: { id: string; lastModified: number }) => {
    updateLocalMasterIndex(event.id, { lastModified: event.lastModified, deleted: true });
});
