/**
 * @file aboutDialog.test.js
 * @brief Tests unitarios para el diálogo AboutDialog y su integración con AutoUpdater.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import './setup.js';
import { AboutDialog, createAboutDialog } from '../components/aboutDialog.js';

describe('AboutDialog - Componente Universal', () => {
  let mockBackend;

  beforeEach(() => {
    vi.useFakeTimers();
    mockBackend = {
      checkForUpdates: vi.fn(),
      getUpdateStatus: vi.fn().mockReturnValue({
        currentVersion: '1.0.0',
        latestVersion: '1.0.0',
        isUpdateAvailable: false
      }),
      openBrowserUrl: vi.fn(),
      addEventListener: vi.fn()
    };
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('se monta en el DOM con los datos del instrumento', () => {
    const dialog = createAboutDialog({
      id: 'test-about-dialog',
      appName: 'ABD TestSynth',
      subtitle: 'Virtual Instrument Emulator',
      description: 'High fidelity DSP synthesizer.',
      version: '1.2.0',
      buildNumber: '20261012'
    });

    const root = document.getElementById('test-about-dialog');
    expect(root).not.toBeNull();
    expect(root.hidden).toBe(true);

    const title = root.querySelector('.abd-about-title');
    expect(title.textContent).toBe('ABD TestSynth');

    const sub = root.querySelector('.abd-about-sub');
    expect(sub.textContent).toBe('Virtual Instrument Emulator');

    const build = root.querySelector('.abd-about-build');
    expect(build.textContent).toContain('Build #20261012');

    const version = root.querySelector('.abd-about-version');
    expect(version.textContent).toBe('v1.2.0');

    dialog.destroy();
    expect(document.getElementById('test-about-dialog')).toBeNull();
  });

  it('gestiona visibilidad con open() y close()', () => {
    const dialog = new AboutDialog({
      id: 'test-about-dialog-visibility',
      appName: 'ABD TestSynth'
    });

    const root = document.getElementById('test-about-dialog-visibility');
    expect(root.hidden).toBe(true);

    dialog.open();
    expect(root.hidden).toBe(false);

    dialog.close();
    expect(root.hidden).toBe(true);

    dialog.destroy();
  });

  it('consulta el backend JUCE al abrir', () => {
    const dialog = new AboutDialog({
      id: 'test-about-dialog-backend',
      appName: 'ABD TestSynth',
      getJuceBackend: () => mockBackend
    });

    dialog.open();
    expect(mockBackend.getUpdateStatus).toHaveBeenCalled();

    const statusEl = document.querySelector('.abd-about-status');
    expect(statusEl.textContent).toContain('You are running the latest version');

    dialog.destroy();
  });

  it('invoca checkForUpdates en backend y muestra estado reactivo', () => {
    const dialog = new AboutDialog({
      id: 'test-about-dialog-check',
      appName: 'ABD TestSynth',
      getJuceBackend: () => mockBackend
    });

    dialog.open();

    const checkBtn = document.querySelector('.abd-btn-check-updates');
    checkBtn.click();

    expect(mockBackend.checkForUpdates).toHaveBeenCalled();
    const statusEl = document.querySelector('.abd-about-status');
    expect(statusEl.textContent).toBe('Checking for updates...');
    expect(statusEl.classList.contains('warning')).toBe(true);

    // Simular recepción de resultado con actualización disponible
    dialog.renderUpdateResult({
      currentVersion: '1.2.0',
      latestVersion: '1.3.0',
      isUpdateAvailable: true,
      downloadUrl: 'https://github.com/ajabadia/ABDSynths/releases/tag/v1.3.0'
    });

    expect(statusEl.classList.contains('success')).toBe(true);
    expect(statusEl.textContent).toContain('New version available: 1.3.0');

    const actionEl = document.querySelector('.abd-about-action');
    expect(actionEl.hidden).toBe(false);

    const downloadBtn = document.querySelector('.abd-btn-download-update');
    expect(downloadBtn.href).toBe('https://github.com/ajabadia/ABDSynths/releases/tag/v1.3.0');

    // Clic en descargar dispara openBrowserUrl en JUCE
    downloadBtn.click();
    expect(mockBackend.openBrowserUrl).toHaveBeenCalledWith('https://github.com/ajabadia/ABDSynths/releases/tag/v1.3.0');

    dialog.destroy();
  });

  it('cierra el diálogo al pulsar el botón CLOSE o hacer clic fuera', () => {
    const dialog = new AboutDialog({
      id: 'test-about-dialog-close',
      appName: 'ABD TestSynth'
    });

    dialog.open();
    const root = document.getElementById('test-about-dialog-close');
    expect(root.hidden).toBe(false);

    const closeBtn = root.querySelector('.abd-btn-about-close');
    closeBtn.click();
    expect(root.hidden).toBe(true);

    // Reabrir y pulsar overlay (clic fuera del cuadro modal)
    dialog.open();
    expect(root.hidden).toBe(false);
    root.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(root.hidden).toBe(true);

    dialog.destroy();
  });

  it('compara versiones correctamente con _isNewerVersion', () => {
    const dialog = new AboutDialog();
    expect(dialog._isNewerVersion('1.3.0', '1.2.0')).toBe(true);
    expect(dialog._isNewerVersion('v2.0.0', 'v1.9.9')).toBe(true);
    expect(dialog._isNewerVersion('1.2.0', '1.2.0')).toBe(false);
    expect(dialog._isNewerVersion('1.1.0', '1.2.0')).toBe(false);
    dialog.destroy();
  });
});
