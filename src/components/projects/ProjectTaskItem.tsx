import React from 'react';

type Props = {
  title: string;
  is_completed: boolean;
  onToggle: () => void;
  onDelete: () => void;
};

const ProjectTaskItem: React.FC<Props> = ({ title, is_completed, onToggle, onDelete }) => {
  return (
    <div className="flex items-center justify-between p-2 border rounded">
      <div className="flex items-center gap-3">
        <input type="checkbox" checked={!!is_completed} onChange={onToggle} />
        <div className={`${is_completed ? 'line-through text-gray-500' : ''}`}>{title}</div>
      </div>
      <div>
        <button onClick={onDelete} className="text-red-600 text-sm">
          Delete
        </button>
      </div>
    </div>
  );
};

export default ProjectTaskItem;
