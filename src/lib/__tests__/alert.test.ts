/**
 * Le routage de `showAlert`.
 *
 * C'est le seul canal de confirmation de l'app (déconnexion, achat, quitter une
 * partie…). S'il tombe dans le vide, un bouton ne fait plus rien du tout — le
 * bug qui avait déjà expédié « impossible de se déconnecter » sur le web. D'où
 * ces tests : natif → Alert de l'OS, web → la modale maison, et si elle n'est
 * pas encore montée, la boîte du navigateur plutôt que rien.
 */
import { Alert, Platform } from 'react-native';

import { setAlertHandler, showAlert } from '../alert';

describe('showAlert', () => {
  const originalOS = Platform.OS;
  const setOS = (os: string) =>
    Object.defineProperty(Platform, 'OS', { value: os, configurable: true });

  afterEach(() => {
    setOS(originalOS);
    setAlertHandler(null);
    jest.restoreAllMocks();
  });

  it('uses the OS Alert on native', () => {
    setOS('ios');
    const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const buttons = [{ text: 'OK' }];
    showAlert('Titre', 'Message', buttons);
    expect(spy).toHaveBeenCalledWith('Titre', 'Message', buttons);
  });

  it('routes to the app dialog on web', () => {
    setOS('web');
    const handler = jest.fn();
    setAlertHandler(handler);
    const buttons = [{ text: 'Annuler', style: 'cancel' as const }, { text: 'Quitter' }];
    showAlert('Quitter ?', 'Perdu.', buttons);
    expect(handler).toHaveBeenCalledWith({ title: 'Quitter ?', message: 'Perdu.', buttons });
  });

  it('never reaches the app dialog on native', () => {
    setOS('android');
    const handler = jest.fn();
    setAlertHandler(handler);
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    showAlert('Titre');
    expect(handler).not.toHaveBeenCalled();
  });

  /** jest-expo ships no window.confirm/alert — install one to spy on. */
  const stubWindow = (name: 'confirm' | 'alert', impl: () => unknown) => {
    const fn = jest.fn(impl);
    Object.defineProperty(window, name, { value: fn, configurable: true, writable: true });
    return fn;
  };

  it('falls back to window.confirm when no dialog is mounted', () => {
    setOS('web');
    const confirmSpy = stubWindow('confirm', () => true);
    const onPress = jest.fn();
    const onCancel = jest.fn();
    showAlert('Quitter ?', 'Perdu.', [
      { text: 'Annuler', style: 'cancel', onPress: onCancel },
      { text: 'Quitter', onPress },
    ]);
    expect(confirmSpy).toHaveBeenCalled();
    expect(onPress).toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('falls back to window.alert for a single button', () => {
    setOS('web');
    const alertSpy = stubWindow('alert', () => undefined);
    const onPress = jest.fn();
    showAlert('Erreur', 'Mot de passe incorrect', [{ text: 'OK', onPress }]);
    expect(alertSpy).toHaveBeenCalled();
    expect(onPress).toHaveBeenCalled();
  });
});
