import React from 'react';

const TaskProgressBar: React.FC<{ progress: number }> = ({ progress }) => {
  const pct = Math.max(0, Math.min(100, Math.round(progress)));
  return (
    <div className="w-full bg-gray-200 rounded h-3 overflow-hidden">
      <div
        className="h-3 bg-green-500 transition-all"
        style={{ width: `${pct}%` }}
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      />
    </div>
  );
};

export default TaskProgressBar;
