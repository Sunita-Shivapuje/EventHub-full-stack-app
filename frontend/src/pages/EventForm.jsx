import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useFetch } from '../hooks.js';
import { Alert, Button, Field, Spinner, inputClass } from '../components/ui.jsx';
import { centsToInput, fromLocalInput, priceToCents, toLocalInput } from '../utils.js';

const CATEGORIES = ['Music', 'Technology', 'Business', 'Food', 'Sports', 'Art', 'Education', 'Community'];
const blank = { title: '', category: '', location: '', description: '', startsAt: '', endsAt: '', capacity: '', price: '0.00' };

export default function EventForm() {
  const { id } = useParams();
  const editing = !!id;
  const navigate = useNavigate();
  const existing = useFetch(() => (editing ? api(`/api/organizer/events/${id}`) : Promise.resolve(null)), [id]);
  const [form, setForm] = useState(blank);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const e = existing.data?.event;
    if (e) setForm({
      title: e.title, category: e.category, location: e.location, description: e.description,
      startsAt: toLocalInput(e.startsAt), endsAt: toLocalInput(e.endsAt),
      capacity: String(e.capacity), price: centsToInput(e.priceCents),
    });
  }, [existing.data]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const reserved = existing.data?.event?.reserved || 0;

  
  function validate() {
    const er = {};
    if (!form.title.trim()) er.title = 'Required';
    if (!form.category.trim()) er.category = 'Required';
    if (!form.location.trim()) er.location = 'Required';
    if (!form.startsAt) er.startsAt = 'Required';
    if (!form.endsAt) er.endsAt = 'Required';
    if (form.startsAt && form.endsAt && new Date(form.endsAt) <= new Date(form.startsAt)) er.endsAt = 'End time must be after the start time';
    if (!editing && form.startsAt && new Date(form.startsAt) <= new Date()) er.startsAt = 'Start time must be in the future';
    if (!/^\d+$/.test(form.capacity) || Number(form.capacity) < 1) er.capacity = 'Enter a whole number of at least 1';
    else if (Number(form.capacity) < reserved) er.capacity = `Cannot be lower than the ${reserved} tickets already booked`;
    if (priceToCents(form.price) === null) er.price = 'Enter an amount like 12.50 (use 0 for free)';
    return er;
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    const er = validate();
    setErrors(er);
    if (Object.keys(er).length) return;
    setBusy(true);
    const body = {
      title: form.title.trim(), category: form.category.trim(), location: form.location.trim(), description: form.description,
      startsAt: fromLocalInput(form.startsAt), endsAt: fromLocalInput(form.endsAt),
      capacity: Number(form.capacity), priceCents: priceToCents(form.price),
    };
    try {
      const d = editing
        ? await api(`/api/organizer/events/${id}`, { method: 'PATCH', body })
        : await api('/api/organizer/events', { method: 'POST', body });
      navigate(`/organizer/events/${d.event.id}`, { state: { saved: editing ? 'Changes saved.' : 'Event created as a draft. Publish it when you are ready.' } });
    } catch (err) {
      if (err.details) setErrors(err.details);
      setError(err.message);
      setBusy(false);
    }
  }

  if (editing && existing.loading) return <Spinner />;
  if (editing && existing.error) return <Alert kind="error">{existing.error.status === 404 ? 'Event not found.' : existing.error.message}</Alert>;
  const status = existing.data?.event?.status;
  if (editing && status && status !== 'draft' && status !== 'published') {
    return <Alert kind="warning">A {status} event can no longer be edited. <Link className="font-semibold underline" to={`/organizer/events/${id}`}>Back to the event</Link></Alert>;
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-3xl font-bold">{editing ? 'Edit event' : 'Create an event'}</h1>
      {editing && reserved > 0 && (
        <Alert kind="info" className="mt-4">This event has {reserved} ticket{reserved === 1 ? '' : 's'} booked. Existing bookings keep their original price, and attendees will see a notice if you change the time or venue.</Alert>
      )}
      <form onSubmit={submit} noValidate className="mt-6 space-y-5 rounded-xl border border-line bg-white p-6">
        {error && <Alert kind="error">{error}</Alert>}
        <Field label="Title" htmlFor="title" error={errors.title}>
          <input id="title" className={inputClass} value={form.title} onChange={set('title')} maxLength={200} />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Category" htmlFor="category" error={errors.category}>
            <input id="category" list="cats" className={inputClass} value={form.category} onChange={set('category')} maxLength={60} />
            <datalist id="cats">{CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
          </Field>
          <Field label="Venue or location" htmlFor="location" error={errors.location}>
            <input id="location" className={inputClass} value={form.location} onChange={set('location')} maxLength={200} />
          </Field>
        </div>
        <Field label="Description" htmlFor="description" error={errors.description}>
          <textarea id="description" rows={5} className={inputClass} value={form.description} onChange={set('description')} maxLength={5000} />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Starts" htmlFor="startsAt" error={errors.startsAt} hint="Your local time zone">
            <input id="startsAt" type="datetime-local" className={inputClass} value={form.startsAt} onChange={set('startsAt')} />
          </Field>
          <Field label="Ends" htmlFor="endsAt" error={errors.endsAt}>
            <input id="endsAt" type="datetime-local" className={inputClass} value={form.endsAt} onChange={set('endsAt')} />
          </Field>
          <Field label="Total ticket capacity" htmlFor="capacity" error={errors.capacity} hint={reserved ? `At least ${reserved} (already booked)` : undefined}>
            <input id="capacity" inputMode="numeric" className={inputClass} value={form.capacity} onChange={set('capacity')} />
          </Field>
          <Field label="Ticket price" htmlFor="price" error={errors.price} hint="Use 0 for a free event">
            <input id="price" inputMode="decimal" className={inputClass} value={form.price} onChange={set('price')} />
          </Field>
        </div>
        <div className="flex flex-wrap justify-end gap-3 border-t border-line pt-5">
          <Button type="button" variant="secondary" onClick={() => navigate(editing ? `/organizer/events/${id}` : '/organizer')}>Discard</Button>
          <Button type="submit" busy={busy}>{editing ? 'Save changes' : 'Save as draft'}</Button>
        </div>
      </form>
    </div>
  );
}
