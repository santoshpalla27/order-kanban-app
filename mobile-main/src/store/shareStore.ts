import { create } from 'zustand';

export interface SharedFile {
  uri: string;
  mimeType: string;
  fileName: string;
  fileSize: number;
}

interface ShareStore {
  pendingFiles: SharedFile[];
  setPendingFiles: (files: SharedFile[]) => void;
  clearPendingFiles: () => void;
}

export const useShareStore = create<ShareStore>((set) => ({
  pendingFiles: [],
  setPendingFiles: (files) => set({ pendingFiles: files }),
  clearPendingFiles: () => set({ pendingFiles: [] }),
}));
