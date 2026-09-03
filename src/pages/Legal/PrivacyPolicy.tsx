import React from 'react';

const PrivacyPolicy: React.FC = () => {
  return (
    <div className="prose max-w-none">
      <h2>Privacy Policy</h2>
      <p>This application is an offline-first desktop app. Below we summarize how data is handled.</p>

      <h3>Local Data Storage</h3>
      <p>
        Your data is stored locally on your device in an encrypted SQLite database managed by the app. The app
        persists tasks, history, and sync queues to disk so they are available offline.
      </p>

      <h3>Cloud Synchronization</h3>
      <p>
        When you enable synchronization, the app uses Supabase to store a copy of your records in the cloud. Local
        writes are always recorded first and queued; network calls are performed only when connectivity is available.
      </p>

      <h3>Encryption</h3>
      <p>
        Data transmitted to the cloud is sent over TLS (HTTPS). Local disk encryption depends on the platform and
        user's device configuration; the application does not ship device-level encryption itself.
      </p>

      <h3>User Rights</h3>
      <p>
        You may request export or deletion of your cloud data via the synchronization provider's mechanisms. The
        application stores only the data you create; sensitive secrets such as raw passwords are never stored locally
        or transmitted in plaintext.
      </p>

      <h3>Contact</h3>
      <p>For questions about privacy, please contact the project maintainers.</p>
    </div>
  );
};

export default PrivacyPolicy;
