import React from 'react';
import { ChangeRequestsView, type ChangeRequestsViewProps } from './ChangeRequestsView';

export type ProjectsViewProps = ChangeRequestsViewProps;

/**
 * ProjectsView transitions smoothly to ChangeRequestsView (ENT-CR-01).
 * Re-exports ChangeRequestsView while maintaining full backward-compatibility.
 */
export const ProjectsView: React.FC<ProjectsViewProps> = (props) => {
  return <ChangeRequestsView {...props} />;
};

export default ProjectsView;
