import type { QdbEditorApi } from '../shared/contracts';

declare global {
  interface Window {
    qdbEditor?: QdbEditorApi;
  }
}

export {};
