import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { selectSql, initLocalDb } from '../lib/localDb';
import { getLogicalDate } from '../lib/dateUtils';
import TaskProgressBar from '../components/daily/TaskProgressBar';

type HistoryRow = {
  id: string;
  user_id: string;
  date: string; // YYYY-MM-DD
  finished_count: number;
  total_count: number;
  percentage: number;
  created_at: string;
  updated_at: string;
};

function formatPct(n: number) {
  return `${n.toFixed(1)}%`;
}

const HistoryPage: React.FC = () => {
  const { user } = useAuth();
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await initLocalDb();
        if (!user?.id) return;
        const data = await selectSql<HistoryRow>('SELECT * FROM daily_history WHERE user_id = ? ORDER BY date DESC', [user.id]);
        if (!mounted) return;
        setRows(data || []);
      } catch (e: any) {
        setError(e?.message || 'Failed to load history');
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [user?.id]);

  const logicalToday = getLogicalDate(new Date());

  // Stats exclude the current logical date (do not include today's unfinalized counts)
  const historical = rows.filter((r) => r.date < logicalToday);

  // Current streak: consecutive days ending at the most recent historical date where percentage>=100 or finished_count>0
  let streak = 0;
  if (historical.length > 0) {
    // create a set of dates that meet the condition for quick lookup
    const goodDates = new Set(historical.filter((r) => (r.percentage ?? 0) >= 100 || (r.finished_count ?? 0) > 0).map((r) => r.date));

    // start from the latest historical date and walk backwards day-by-day
    const latestDate = historical[0].date; // ordered desc
    let cursor = new Date(`${latestDate}T12:00:00`);
    while (true) {
      const dStr = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
      if (goodDates.has(dStr)) {
        streak += 1;
        // move cursor back one day
        cursor.setDate(cursor.getDate() - 1);
      } else {
        break;
      }
    }
  }

  // Average completion rate across historical records
  const avgPct = historical.length === 0 ? 0 : historical.reduce((s, r) => s + (r.percentage ?? 0), 0) / historical.length;
  const totalFinished = historical.reduce((s, r) => s + (r.finished_count ?? 0), 0);

  return (
    <div className="p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-semibold">History</h1>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 border rounded">
            <div className="text-sm text-gray-500">Current Streak</div>
            <div className="text-2xl font-bold">{streak}</div>
          </div>

          <div className="p-4 border rounded">
            <div className="text-sm text-gray-500">Average Completion</div>
            <div className="text-2xl font-bold">{formatPct(avgPct)}</div>
          </div>

          <div className="p-4 border rounded">
            <div className="text-sm text-gray-500">Total Tasks Finished</div>
            <div className="text-2xl font-bold">{totalFinished}</div>
          </div>
        </div>

        <div className="mt-6">
          {loading && <div>Loading...</div>}
          {error && <div className="text-red-600">{error}</div>}

          <div className="mt-4 overflow-x-auto">
            <table className="w-full table-auto border-collapse">
              <thead>
                <tr className="text-left">
                  <th className="px-3 py-2 border-b">Date</th>
                  <th className="px-3 py-2 border-b">Completed</th>
                  <th className="px-3 py-2 border-b">%</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="align-top">
                    <td className="px-3 py-2 border-b">{r.date}</td>
                    <td className="px-3 py-2 border-b">{`${r.finished_count}/${r.total_count}`}</td>
                    <td className="px-3 py-2 border-b w-1/3">
                      <div className="max-w-xs">
                        <TaskProgressBar progress={Number(r.percentage ?? 0)} />
                        <div className="text-sm text-gray-600 mt-1">{formatPct(Number(r.percentage ?? 0))}</div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HistoryPage;
