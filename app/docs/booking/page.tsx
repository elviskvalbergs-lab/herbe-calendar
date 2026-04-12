import Link from 'next/link'

export default function BookingPage() {
  return (
    <>
      <div className="mb-8">
        <Link href="/docs" className="text-sm text-text-muted hover:text-text transition-colors">
          &larr; Back to Docs
        </Link>
      </div>

      <h1 className="text-3xl font-bold mb-2">Booking &amp; Scheduling</h1>
      <p className="text-text-muted mb-8">
        Let clients and external parties book time slots based on your real availability — with templates,
        confirmations, and cancellation links.
      </p>

      <nav className="mb-8 p-4 bg-surface rounded-lg border border-border">
        <p className="text-xs font-bold text-text-muted uppercase tracking-wide mb-2">On this page</p>
        <ul className="space-y-1">
          <li><a href="#booking-templates" className="text-sm text-primary hover:underline">Booking Templates</a></li>
          <li><a href="#enabling-booking" className="text-sm text-primary hover:underline">Enabling Booking on a Share Link</a></li>
          <li><a href="#day-limit" className="text-sm text-primary hover:underline">Day Limit</a></li>
          <li><a href="#booking-flow" className="text-sm text-primary hover:underline">The Booking Flow</a></li>
          <li><a href="#after-booking" className="text-sm text-primary hover:underline">What Happens After Booking</a></li>
        </ul>
      </nav>

      <div className="space-y-10">

        <section>
          <h2 id="booking-templates" className="text-xl font-semibold mb-3 pb-2 border-b border-border">Booking Templates</h2>
          <p className="text-text-muted mb-3">
            Templates define the rules for a type of bookable meeting. Create as many templates as you need
            for different meeting types, durations, or teams.
          </p>

          <h3 id="creating-template" className="font-semibold mb-2 text-sm uppercase tracking-wide text-text-muted">Creating a Template</h3>
          <p className="text-text-muted text-sm mb-3">
            Go to Settings &gt; Templates and click &quot;New template&quot;. Configure the following:
          </p>

          <div className="space-y-3 mb-4">
            <div className="bg-surface border border-border rounded-lg px-4 py-3">
              <span className="font-semibold text-sm">Duration</span>
              <p className="text-sm text-text-muted mt-0.5">Length of each bookable slot in minutes.</p>
            </div>
            <div className="bg-surface border border-border rounded-lg px-4 py-3">
              <span className="font-semibold text-sm">Buffer minutes</span>
              <p className="text-sm text-text-muted mt-0.5">Time blocked before and/or after each booking to prevent back-to-back meetings.</p>
            </div>
            <div className="bg-surface border border-border rounded-lg px-4 py-3">
              <span className="font-semibold text-sm">Availability windows</span>
              <p className="text-sm text-text-muted mt-0.5">Define the hours available for booking on each day of the week. For example, Monday 09:00–17:00, Tuesday 10:00–16:00.</p>
            </div>
            <div className="bg-surface border border-border rounded-lg px-4 py-3">
              <span className="font-semibold text-sm">Booking targets</span>
              <p className="text-sm text-text-muted mt-0.5">Where confirmed bookings are created. Choose one or more: ERP activity, Outlook event, Google Calendar event, Zoom meeting.</p>
            </div>
            <div className="bg-surface border border-border rounded-lg px-4 py-3">
              <span className="font-semibold text-sm">Custom fields</span>
              <p className="text-sm text-text-muted mt-0.5">Add extra fields to the booking form — text, dropdown, or checkbox. The booker fills these in when booking.</p>
            </div>
            <div className="bg-surface border border-border rounded-lg px-4 py-3">
              <span className="font-semibold text-sm">Holiday blocking</span>
              <p className="text-sm text-text-muted mt-0.5">Automatically block days that are public holidays in the configured country. Holiday data comes from the holidays API.</p>
            </div>
          </div>
        </section>

        <section>
          <h2 id="enabling-booking" className="text-xl font-semibold mb-3 pb-2 border-b border-border">Enabling Booking on a Share Link</h2>
          <p className="text-text-muted mb-3">
            Booking is opt-in per share link. A share link must exist before you can enable booking on it.
          </p>
          <ul className="space-y-1 text-text-muted text-sm list-disc list-inside mb-4">
            <li>Open the share link settings from the Favorites dropdown</li>
            <li>Toggle &quot;Enable booking&quot; on</li>
            <li>Select one or more booking templates to make available to the booker</li>
            <li>Set the day limit — how far ahead the booker can see available slots (14 to 365 days)</li>
            <li>Save the settings; the share link now shows a booking interface</li>
          </ul>
          <p className="text-text-muted text-sm">
            The share link&apos;s visibility setting still controls what the booker can see in the calendar view,
            independent of the booking functionality.
          </p>
        </section>

        <section>
          <h2 id="day-limit" className="text-xl font-semibold mb-3 pb-2 border-b border-border">Day Limit</h2>
          <p className="text-text-muted mb-3">
            The day limit restricts how far ahead a booker can schedule a meeting. This prevents bookings
            too far in the future before your availability is known.
          </p>
          <ul className="space-y-1 text-text-muted text-sm list-disc list-inside">
            <li>Minimum: 14 days</li>
            <li>Maximum: 365 days</li>
            <li>Configured per share link, not per template</li>
            <li>Days beyond the limit appear grayed out in the booking calendar</li>
          </ul>
        </section>

        <section>
          <h2 id="booking-flow" className="text-xl font-semibold mb-3 pb-2 border-b border-border">The Booking Flow</h2>
          <p className="text-text-muted mb-3">
            This is what the booker experiences when they open a booking-enabled share link.
          </p>

          <div className="space-y-3">
            <div className="flex gap-4 items-start">
              <div className="w-7 h-7 rounded-full bg-primary flex-shrink-0 flex items-center justify-center text-white text-xs font-bold mt-0.5">1</div>
              <div>
                <p className="font-semibold text-sm">Select a template</p>
                <p className="text-sm text-text-muted">If multiple templates are enabled, the booker chooses which type of meeting they want.</p>
              </div>
            </div>
            <div className="flex gap-4 items-start">
              <div className="w-7 h-7 rounded-full bg-primary flex-shrink-0 flex items-center justify-center text-white text-xs font-bold mt-0.5">2</div>
              <div>
                <p className="font-semibold text-sm">Pick a date</p>
                <p className="text-sm text-text-muted">A calendar shows the upcoming days within the day limit. Dots indicate days with available slots. Holidays and fully booked days are blocked.</p>
              </div>
            </div>
            <div className="flex gap-4 items-start">
              <div className="w-7 h-7 rounded-full bg-primary flex-shrink-0 flex items-center justify-center text-white text-xs font-bold mt-0.5">3</div>
              <div>
                <p className="font-semibold text-sm">Pick a time slot</p>
                <p className="text-sm text-text-muted">Available time slots for the selected date are shown. Slots that overlap with existing events are hidden. Buffer time is automatically accounted for.</p>
              </div>
            </div>
            <div className="flex gap-4 items-start">
              <div className="w-7 h-7 rounded-full bg-primary flex-shrink-0 flex items-center justify-center text-white text-xs font-bold mt-0.5">4</div>
              <div>
                <p className="font-semibold text-sm">Fill in the form</p>
                <p className="text-sm text-text-muted">The booker enters their name, email, and any custom fields defined in the template.</p>
              </div>
            </div>
            <div className="flex gap-4 items-start">
              <div className="w-7 h-7 rounded-full bg-primary flex-shrink-0 flex items-center justify-center text-white text-xs font-bold mt-0.5">5</div>
              <div>
                <p className="font-semibold text-sm">Confirm</p>
                <p className="text-sm text-text-muted">The booker reviews the details and confirms. The booking is processed immediately.</p>
              </div>
            </div>
          </div>
        </section>

        <section>
          <h2 id="after-booking" className="text-xl font-semibold mb-3 pb-2 border-b border-border">What Happens After Booking</h2>
          <ul className="space-y-1 text-text-muted text-sm list-disc list-inside">
            <li>An activity or event is created in all configured booking targets (ERP, Outlook, Google)</li>
            <li>If Zoom is a target, a Zoom meeting is created and the link is included</li>
            <li>A confirmation email is sent to the booker (if SMTP is configured)</li>
            <li>The confirmation page shows meeting details and a cancellation link</li>
            <li>The booker can use the cancel link to cancel the booking at any time</li>
            <li>Cancelling removes the event from all booking targets</li>
          </ul>
        </section>

      </div>
    </>
  )
}
