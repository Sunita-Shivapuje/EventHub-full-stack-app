import { Link, Route, Routes } from 'react-router-dom';
import { Layout, RequireAuth } from './components/Layout.jsx';
import Events from './pages/Events.jsx';
import EventDetail from './pages/EventDetail.jsx';
import { Login, Register } from './pages/AuthPages.jsx';
import MyBookings from './pages/MyBookings.jsx';
import BookingDetail from './pages/BookingDetail.jsx';
import OrganizerEvents from './pages/OrganizerEvents.jsx';
import EventForm from './pages/EventForm.jsx';
import EventDashboard from './pages/EventDashboard.jsx';

const NotFound = () => (
  <div className="py-20 text-center">
    <h1 className="font-display text-3xl font-bold">Page not found</h1>
    <p className="mt-2 text-muted">That page does not exist.</p>
    <Link to="/" className="mt-4 inline-block font-semibold text-brand hover:underline">Browse events</Link>
  </div>
);

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Events />} />
        <Route path="events/:id" element={<EventDetail />} />
        <Route path="login" element={<Login />} />
        <Route path="register" element={<Register />} />
        <Route path="bookings" element={<RequireAuth role="attendee"><MyBookings /></RequireAuth>} />
        <Route path="bookings/:id" element={<RequireAuth role="attendee"><BookingDetail /></RequireAuth>} />
        <Route path="organizer" element={<RequireAuth role="organizer"><OrganizerEvents /></RequireAuth>} />
        <Route path="organizer/events/new" element={<RequireAuth role="organizer"><EventForm /></RequireAuth>} />
        <Route path="organizer/events/:id/edit" element={<RequireAuth role="organizer"><EventForm /></RequireAuth>} />
        <Route path="organizer/events/:id" element={<RequireAuth role="organizer"><EventDashboard /></RequireAuth>} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
