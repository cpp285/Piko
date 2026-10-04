'use client';

import { useEffect, useState } from 'react';
import { useOfficeStore } from '@/store/office-store';
import { useLocale } from '@/lib/ui-language';

/** Native lifecycle only. Agent execution continues to use the authenticated gateway. */
export default function DesktopBridge() {
  const locale = useLocale();
  const [error, setError] = useState('');
  const [restarting, setRestarting] = useState(false);
  const t = (zh: string, en: string) => locale === 'zh' ? zh : en;
  useEffect(() => {
    if (!(window as any).__TAURI_INTERNALS__) return;
    document.documentElement.dataset.desktop = 'true';
    let cancelled = false;
    const cleanup: (() => void)[] = [];
    void Promise.all([import('@tauri-apps/api/core'), import('@tauri-apps/api/event')]).then(async ([{ invoke }, { listen }]) => {
      const addListener = async (name: string, cb: (event: { payload: any }) => void) => {
        const unlisten = await listen(name, cb);
        if (cancelled) unlisten(); else cleanup.push(unlisten);
      };
      await addListener('desktop-settings', () => window.dispatchEvent(new Event('piko-open-settings')));
      await addListener('gateway-error', event => { if (!cancelled) setError(String(event.payload)); });
      const startupError = await invoke<string | null>('get_gateway_error');
      if (!cancelled && startupError) setError(startupError);
      let previous = -1;
      const sync = () => {
        const state = useOfficeStore.getState();
        const count = [...state.agents.values()].filter(a => a.status === 'working' || a.status === 'waiting_approval' || a.awaitingApproval).length;
        if (count !== previous) { previous = count; void invoke('set_active_tasks', { count }).catch(() => {}); }
      };
      if (!cancelled) { sync(); cleanup.push(useOfficeStore.subscribe(sync)); }
    }).catch(() => { if (!cancelled) setError(t('桌面连接初始化失败，请重新打开应用。', 'Desktop connection failed. Please reopen the app.')); });
    return () => { cancelled = true; cleanup.forEach(fn => fn()); };
  }, []); // Locale changes should not recreate native lifecycle subscriptions.

  if (!error) return null;
  return <div className="desktop-recovery" role="alert">
    <div><strong>{t('本地服务需要重新启动', 'Local service needs a restart')}</strong><p>{error}</p></div>
    <button disabled={restarting} onClick={async () => {
      setRestarting(true);
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('restart_gateway');
        window.location.href = '/pair/';
      } catch (e) { setError(String(e)); setRestarting(false); }
    }}>{restarting ? t('正在启动…', 'Restarting…') : t('重新启动', 'Restart')}</button>
  </div>;
}
