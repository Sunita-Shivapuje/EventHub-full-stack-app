import { useState } from 'react';
import { api } from '../api.js';
import { Button, ConfirmDialog, LinkButton } from './ui.jsx';

const COPY = {
  publish: {
    title: 'Publish this event?', label: 'Publish event', danger: false,
    body: 'It will appear in public discovery and attendees can start booking tickets.',
  },
  unpublish: {
    title: 'Unpublish this event?', label: 'Unpublish', danger: false,
    body: 'It returns to Draft and disappears from discovery. This is only possible while there are no active bookings.',
  },
  cancel: {
    title: 'Cancel this event?', label: 'Yes, cancel event', danger: true,
    body: 'The event is permanently cancelled. Every active booking is marked as cancelled by the organizer (history is kept) and tickets are released. This cannot be undone.',
  },
};


export default function EventActions({ event, onChanged, showManage = false }) {
  const [action, setAction] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function run() {
    setBusy(true); setError('');
    try {
      await api(`/api/organizer/events/${event.id}/${action}`, { method: 'POST' });
      setAction(null);
      onChanged?.(action);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  const open = (a) => { setError(''); setAction(a); };
  const s = event.status;
  const copy = action && COPY[action];

  return (
    <div className="flex flex-wrap gap-2">
      {showManage && <LinkButton to={`/organizer/events/${event.id}`} variant="primary">Manage</LinkButton>}
      {(s === 'draft' || s === 'published') && <LinkButton to={`/organizer/events/${event.id}/edit`}>Edit</LinkButton>}
      {s === 'draft' && <Button onClick={() => open('publish')}>Publish</Button>}
      {s === 'published' && <Button variant="secondary" onClick={() => open('unpublish')}>Unpublish</Button>}
      {(s === 'draft' || s === 'published') && <Button variant="danger" onClick={() => open('cancel')}>Cancel event</Button>}
      <ConfirmDialog open={!!action} title={copy?.title} confirmLabel={copy?.label} danger={copy?.danger}
        busy={busy} error={error} onConfirm={run} onCancel={() => setAction(null)}>
        <p>{copy?.body}</p>
      </ConfirmDialog>
    </div>
  );
}
