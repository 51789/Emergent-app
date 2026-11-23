import { create } from 'zustand';

import i18n from '@/i18n';

export interface DialogButton {
  label: string;
  /** `cancel` buttons are rendered as secondary, `destructive` ones in red. */
  style?: 'default' | 'cancel' | 'destructive';
  value: string;
}

export interface DialogRequest {
  id: number;
  title: string;
  message?: string;
  buttons: DialogButton[];
  resolve: (value: string) => void;
}

interface DialogState {
  queue: DialogRequest[];
  push: (request: DialogRequest) => void;
  close: (id: number, value: string) => void;
}

export const useDialogStore = create<DialogState>((set, get) => ({
  queue: [],
  push: (request) => set((state) => ({ queue: [...state.queue, request] })),
  close: (id, value) => {
    const request = get().queue.find((item) => item.id === id);
    set((state) => ({ queue: state.queue.filter((item) => item.id !== id) }));
    request?.resolve(value);
  },
}));

let nextId = 1;

function open(title: string, message: string | undefined, buttons: DialogButton[]): Promise<string> {
  return new Promise((resolve) => {
    useDialogStore.getState().push({ id: nextId++, title, message, buttons, resolve });
  });
}

/**
 * Imperative dialogs that work on iOS, Android and web.
 * `Alert.alert` is a silent no-op on react-native-web, so the app never uses it.
 * Requires `<DialogHost />` to be mounted once at the root.
 */
export const dialog = {
  /** Yes/no confirmation. Resolves `true` when the user confirms. */
  async confirm(options: {
    title: string;
    message?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
  }): Promise<boolean> {
    const value = await open(options.title, options.message, [
      { label: options.cancelLabel ?? i18n.t('common.cancel'), style: 'cancel', value: 'cancel' },
      {
        label: options.confirmLabel ?? i18n.t('common.confirm'),
        style: options.destructive ? 'destructive' : 'default',
        value: 'confirm',
      },
    ]);
    return value === 'confirm';
  },

  /** Single-button informational dialog. */
  async alert(title: string, message?: string, okLabel?: string): Promise<void> {
    await open(title, message, [
      { label: okLabel ?? i18n.t('common.ok'), style: 'default', value: 'ok' },
    ]);
  },

  /** Two-button dialog with a primary action (e.g. "See plans"). Resolves `true` for the action. */
  async prompt(options: {
    title: string;
    message?: string;
    actionLabel: string;
    dismissLabel?: string;
  }): Promise<boolean> {
    const value = await open(options.title, options.message, [
      { label: options.dismissLabel ?? i18n.t('common.close'), style: 'cancel', value: 'dismiss' },
      { label: options.actionLabel, style: 'default', value: 'action' },
    ]);
    return value === 'action';
  },
};
