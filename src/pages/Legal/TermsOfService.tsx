import React from 'react';

const TermsOfService: React.FC = () => {
  return (
    <div className="prose max-w-none">
      <h2>Terms of Service</h2>
      <p>
        By using this application you agree to its terms. This document outlines how the app stores and synchronizes
        your data.
      </p>

      <h3>Data Storage and Sync</h3>
      <p>
        The application stores data locally on your device. When synchronization is enabled, the app will transmit
        records to Supabase to provide cross-device sync. Local changes are queued and pushed when network access is
        available to ensure offline-first reliability.
      </p>

      <h3>Data Confidentiality</h3>
      <p>
        Communications with the cloud provider use standard TLS encryption. The app does not expose your credentials
        or raw passwords; authentication is delegated to the Supabase authentication service.
      </p>

      <h3>Soft Deletion and Conflict Resolution</h3>
      <p>
        The app uses soft deletes (a `deleted_at` timestamp) for records synchronized to the cloud. Conflict
        resolution uses last-write-wins semantics based on ISO `updated_at` timestamps; the most recent change is
        authoritative.
      </p>

      <h3>Limitations</h3>
      <p>
        Local disk encryption depends on your OS. While the app uses secure network transports, absolute security of
        data at rest is dependent on the host device and user configuration.
      </p>

      <h3>Contact</h3>
      <p>Contact the maintainers for questions, data export, or removal requests.</p>
    </div>
  );
};

export default TermsOfService;
