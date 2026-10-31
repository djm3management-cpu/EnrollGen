import AppToast from './AppToast';

export default function ContactToast({ message, onDismiss, error = false }) {
  return message ? <AppToast message={message} tone={error ? 'error' : 'success'} onDismiss={onDismiss} /> : null;
}
