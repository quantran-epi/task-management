import { useId, type CSSProperties, type MouseEventHandler, type ReactNode } from 'react';
import { useThemeMode } from '../../hooks/useThemeMode';
import styles from './openidea/icons.module.css';
import { getSharedControlTokens, getStatusTokens, type StatusKind } from './tokens.contract';
import descriptorData from './icon-svgs/descriptors.json';

/** Static, vendored OpenIDEA SVG descriptor (Apache-2.0/MIT; no untrusted input). */
interface IconSvgDescriptor {
  viewBox: string;
  body: string;
  mono: boolean;
  source: string;
}

const ApartmentOutlinedIcon = descriptorData.apartmentOutlinedIcon as IconSvgDescriptor;
const ApiOutlinedIcon = descriptorData.apiOutlinedIcon as IconSvgDescriptor;
const AppstoreOutlinedIcon = descriptorData.appstoreOutlinedIcon as IconSvgDescriptor;
const ArrowLeftOutlinedIcon = descriptorData.arrowLeftOutlinedIcon as IconSvgDescriptor;
const ArrowRightOutlinedIcon = descriptorData.arrowRightOutlinedIcon as IconSvgDescriptor;
const ArrowUpOutlinedIcon = descriptorData.arrowUpOutlinedIcon as IconSvgDescriptor;
const BarChartOutlinedIcon = descriptorData.barChartOutlinedIcon as IconSvgDescriptor;
const BellOutlinedIcon = descriptorData.bellOutlinedIcon as IconSvgDescriptor;
const BookOutlinedIcon = descriptorData.bookOutlinedIcon as IconSvgDescriptor;
const BranchesOutlinedIcon = descriptorData.branchesOutlinedIcon as IconSvgDescriptor;
const BugOutlinedIcon = descriptorData.bugOutlinedIcon as IconSvgDescriptor;
const BulbOutlinedIcon = descriptorData.bulbOutlinedIcon as IconSvgDescriptor;
const CalendarOutlinedIcon = descriptorData.calendarOutlinedIcon as IconSvgDescriptor;
const CameraOutlinedIcon = descriptorData.cameraOutlinedIcon as IconSvgDescriptor;
const CaretDownOutlinedIcon = descriptorData.caretDownOutlinedIcon as IconSvgDescriptor;
const CaretRightOutlinedIcon = descriptorData.caretRightOutlinedIcon as IconSvgDescriptor;
const CheckCircleFilledIcon = descriptorData.checkCircleFilledIcon as IconSvgDescriptor;
const CheckCircleOutlinedIcon = descriptorData.checkCircleOutlinedIcon as IconSvgDescriptor;
const CheckOutlinedIcon = descriptorData.checkOutlinedIcon as IconSvgDescriptor;
const CheckSquareOutlinedIcon = descriptorData.checkSquareOutlinedIcon as IconSvgDescriptor;
const ClearOutlinedIcon = descriptorData.clearOutlinedIcon as IconSvgDescriptor;
const ClockCircleOutlinedIcon = descriptorData.clockCircleOutlinedIcon as IconSvgDescriptor;
const CloseCircleOutlinedIcon = descriptorData.closeCircleOutlinedIcon as IconSvgDescriptor;
const CloseOutlinedIcon = descriptorData.closeOutlinedIcon as IconSvgDescriptor;
const CloudDownloadOutlinedIcon = descriptorData.cloudDownloadOutlinedIcon as IconSvgDescriptor;
const CloudOutlinedIcon = descriptorData.cloudOutlinedIcon as IconSvgDescriptor;
const CloudServerOutlinedIcon = descriptorData.cloudServerOutlinedIcon as IconSvgDescriptor;
const CloudSyncOutlinedIcon = descriptorData.cloudSyncOutlinedIcon as IconSvgDescriptor;
const CloudUploadOutlinedIcon = descriptorData.cloudUploadOutlinedIcon as IconSvgDescriptor;
const CodeOutlinedIcon = descriptorData.codeOutlinedIcon as IconSvgDescriptor;
const ColumnWidthOutlinedIcon = descriptorData.columnWidthOutlinedIcon as IconSvgDescriptor;
const CommentOutlinedIcon = descriptorData.commentOutlinedIcon as IconSvgDescriptor;
const CompassOutlinedIcon = descriptorData.compassOutlinedIcon as IconSvgDescriptor;
const ControlOutlinedIcon = descriptorData.controlOutlinedIcon as IconSvgDescriptor;
const CopyOutlinedIcon = descriptorData.copyOutlinedIcon as IconSvgDescriptor;
const CrownOutlinedIcon = descriptorData.crownOutlinedIcon as IconSvgDescriptor;
const DashboardOutlinedIcon = descriptorData.dashboardOutlinedIcon as IconSvgDescriptor;
const DatabaseOutlinedIcon = descriptorData.databaseOutlinedIcon as IconSvgDescriptor;
const DeleteOutlinedIcon = descriptorData.deleteOutlinedIcon as IconSvgDescriptor;
const DeploymentUnitOutlinedIcon = descriptorData.deploymentUnitOutlinedIcon as IconSvgDescriptor;
const DesktopOutlinedIcon = descriptorData.desktopOutlinedIcon as IconSvgDescriptor;
const DiffOutlinedIcon = descriptorData.diffOutlinedIcon as IconSvgDescriptor;
const DisconnectOutlinedIcon = descriptorData.disconnectOutlinedIcon as IconSvgDescriptor;
const DownCircleOutlinedIcon = descriptorData.downCircleOutlinedIcon as IconSvgDescriptor;
const DownOutlinedIcon = descriptorData.downOutlinedIcon as IconSvgDescriptor;
const DownloadOutlinedIcon = descriptorData.downloadOutlinedIcon as IconSvgDescriptor;
const DragOutlinedIcon = descriptorData.dragOutlinedIcon as IconSvgDescriptor;
const EditOutlinedIcon = descriptorData.editOutlinedIcon as IconSvgDescriptor;
const ExclamationCircleFilledIcon = descriptorData.exclamationCircleFilledIcon as IconSvgDescriptor;
const ExclamationCircleOutlinedIcon = descriptorData.exclamationCircleOutlinedIcon as IconSvgDescriptor;
const ExpandAltOutlinedIcon = descriptorData.expandAltOutlinedIcon as IconSvgDescriptor;
const ExperimentFilledIcon = descriptorData.experimentFilledIcon as IconSvgDescriptor;
const ExperimentOutlinedIcon = descriptorData.experimentOutlinedIcon as IconSvgDescriptor;
const ExportOutlinedIcon = descriptorData.exportOutlinedIcon as IconSvgDescriptor;
const EyeInvisibleOutlinedIcon = descriptorData.eyeInvisibleOutlinedIcon as IconSvgDescriptor;
const EyeOutlinedIcon = descriptorData.eyeOutlinedIcon as IconSvgDescriptor;
const FieldTimeOutlinedIcon = descriptorData.fieldTimeOutlinedIcon as IconSvgDescriptor;
const FileAddOutlinedIcon = descriptorData.fileAddOutlinedIcon as IconSvgDescriptor;
const FileExcelOutlinedIcon = descriptorData.fileExcelOutlinedIcon as IconSvgDescriptor;
const FileMarkdownOutlinedIcon = descriptorData.fileMarkdownOutlinedIcon as IconSvgDescriptor;
const FileOutlinedIcon = descriptorData.fileOutlinedIcon as IconSvgDescriptor;
const FilePptOutlinedIcon = descriptorData.filePptOutlinedIcon as IconSvgDescriptor;
const FileSearchOutlinedIcon = descriptorData.fileSearchOutlinedIcon as IconSvgDescriptor;
const FileTextOutlinedIcon = descriptorData.fileTextOutlinedIcon as IconSvgDescriptor;
const FileWordOutlinedIcon = descriptorData.fileWordOutlinedIcon as IconSvgDescriptor;
const FilterOutlinedIcon = descriptorData.filterOutlinedIcon as IconSvgDescriptor;
const FireOutlinedIcon = descriptorData.fireOutlinedIcon as IconSvgDescriptor;
const FlagOutlinedIcon = descriptorData.flagOutlinedIcon as IconSvgDescriptor;
const FolderAddOutlinedIcon = descriptorData.folderAddOutlinedIcon as IconSvgDescriptor;
const FolderFilledIcon = descriptorData.folderFilledIcon as IconSvgDescriptor;
const FolderOpenFilledIcon = descriptorData.folderOpenFilledIcon as IconSvgDescriptor;
const FolderOpenOutlinedIcon = descriptorData.folderOpenOutlinedIcon as IconSvgDescriptor;
const FolderOutlinedIcon = descriptorData.folderOutlinedIcon as IconSvgDescriptor;
const FolderViewOutlinedIcon = descriptorData.folderViewOutlinedIcon as IconSvgDescriptor;
const FormOutlinedIcon = descriptorData.formOutlinedIcon as IconSvgDescriptor;
const FormatPainterOutlinedIcon = descriptorData.formatPainterOutlinedIcon as IconSvgDescriptor;
const FullscreenExitOutlinedIcon = descriptorData.fullscreenExitOutlinedIcon as IconSvgDescriptor;
const FullscreenOutlinedIcon = descriptorData.fullscreenOutlinedIcon as IconSvgDescriptor;
const FundProjectionScreenOutlinedIcon = descriptorData.fundProjectionScreenOutlinedIcon as IconSvgDescriptor;
const GithubOutlinedIcon = descriptorData.githubOutlinedIcon as IconSvgDescriptor;
const GlobalOutlinedIcon = descriptorData.globalOutlinedIcon as IconSvgDescriptor;
const HddOutlinedIcon = descriptorData.hddOutlinedIcon as IconSvgDescriptor;
const HistoryOutlinedIcon = descriptorData.historyOutlinedIcon as IconSvgDescriptor;
const HourglassOutlinedIcon = descriptorData.hourglassOutlinedIcon as IconSvgDescriptor;
const ImportOutlinedIcon = descriptorData.importOutlinedIcon as IconSvgDescriptor;
const InboxOutlinedIcon = descriptorData.inboxOutlinedIcon as IconSvgDescriptor;
const InfoCircleOutlinedIcon = descriptorData.infoCircleOutlinedIcon as IconSvgDescriptor;
const KeyOutlinedIcon = descriptorData.keyOutlinedIcon as IconSvgDescriptor;
const LeftOutlinedIcon = descriptorData.leftOutlinedIcon as IconSvgDescriptor;
const LinkOutlinedIcon = descriptorData.linkOutlinedIcon as IconSvgDescriptor;
const LoadingOutlinedIcon = descriptorData.loadingOutlinedIcon as IconSvgDescriptor;
const LockOutlinedIcon = descriptorData.lockOutlinedIcon as IconSvgDescriptor;
const MenuFoldOutlinedIcon = descriptorData.menuFoldOutlinedIcon as IconSvgDescriptor;
const MenuUnfoldOutlinedIcon = descriptorData.menuUnfoldOutlinedIcon as IconSvgDescriptor;
const MessageOutlinedIcon = descriptorData.messageOutlinedIcon as IconSvgDescriptor;
const MinusCircleOutlinedIcon = descriptorData.minusCircleOutlinedIcon as IconSvgDescriptor;
const MinusOutlinedIcon = descriptorData.minusOutlinedIcon as IconSvgDescriptor;
const MoonOutlinedIcon = descriptorData.moonOutlinedIcon as IconSvgDescriptor;
const MoreOutlinedIcon = descriptorData.moreOutlinedIcon as IconSvgDescriptor;
const NodeIndexOutlinedIcon = descriptorData.nodeIndexOutlinedIcon as IconSvgDescriptor;
const NotificationOutlinedIcon = descriptorData.notificationOutlinedIcon as IconSvgDescriptor;
const OrderedListOutlinedIcon = descriptorData.orderedListOutlinedIcon as IconSvgDescriptor;
const PaperClipOutlinedIcon = descriptorData.paperClipOutlinedIcon as IconSvgDescriptor;
const PauseCircleOutlinedIcon = descriptorData.pauseCircleOutlinedIcon as IconSvgDescriptor;
const PictureOutlinedIcon = descriptorData.pictureOutlinedIcon as IconSvgDescriptor;
const PlayCircleOutlinedIcon = descriptorData.playCircleOutlinedIcon as IconSvgDescriptor;
const PlusOutlinedIcon = descriptorData.plusOutlinedIcon as IconSvgDescriptor;
const ProjectOutlinedIcon = descriptorData.projectOutlinedIcon as IconSvgDescriptor;
const PushpinFilledIcon = descriptorData.pushpinFilledIcon as IconSvgDescriptor;
const PushpinOutlinedIcon = descriptorData.pushpinOutlinedIcon as IconSvgDescriptor;
const QuestionCircleOutlinedIcon = descriptorData.questionCircleOutlinedIcon as IconSvgDescriptor;
const ReloadOutlinedIcon = descriptorData.reloadOutlinedIcon as IconSvgDescriptor;
const RightOutlinedIcon = descriptorData.rightOutlinedIcon as IconSvgDescriptor;
const RobotOutlinedIcon = descriptorData.robotOutlinedIcon as IconSvgDescriptor;
const RocketOutlinedIcon = descriptorData.rocketOutlinedIcon as IconSvgDescriptor;
const SafetyCertificateOutlinedIcon = descriptorData.safetyCertificateOutlinedIcon as IconSvgDescriptor;
const SaveOutlinedIcon = descriptorData.saveOutlinedIcon as IconSvgDescriptor;
const ScheduleOutlinedIcon = descriptorData.scheduleOutlinedIcon as IconSvgDescriptor;
const SearchOutlinedIcon = descriptorData.searchOutlinedIcon as IconSvgDescriptor;
const SendOutlinedIcon = descriptorData.sendOutlinedIcon as IconSvgDescriptor;
const SettingOutlinedIcon = descriptorData.settingOutlinedIcon as IconSvgDescriptor;
const SplitCellsOutlinedIcon = descriptorData.splitCellsOutlinedIcon as IconSvgDescriptor;
const StarOutlinedIcon = descriptorData.starOutlinedIcon as IconSvgDescriptor;
const StopOutlinedIcon = descriptorData.stopOutlinedIcon as IconSvgDescriptor;
const SunOutlinedIcon = descriptorData.sunOutlinedIcon as IconSvgDescriptor;
const SwapOutlinedIcon = descriptorData.swapOutlinedIcon as IconSvgDescriptor;
const SyncOutlinedIcon = descriptorData.syncOutlinedIcon as IconSvgDescriptor;
const TagOutlinedIcon = descriptorData.tagOutlinedIcon as IconSvgDescriptor;
const TagsOutlinedIcon = descriptorData.tagsOutlinedIcon as IconSvgDescriptor;
const TeamOutlinedIcon = descriptorData.teamOutlinedIcon as IconSvgDescriptor;
const ThunderboltFilledIcon = descriptorData.thunderboltFilledIcon as IconSvgDescriptor;
const ThunderboltOutlinedIcon = descriptorData.thunderboltOutlinedIcon as IconSvgDescriptor;
const ToolOutlinedIcon = descriptorData.toolOutlinedIcon as IconSvgDescriptor;
const UndoOutlinedIcon = descriptorData.undoOutlinedIcon as IconSvgDescriptor;
const UnlockOutlinedIcon = descriptorData.unlockOutlinedIcon as IconSvgDescriptor;
const UpOutlinedIcon = descriptorData.upOutlinedIcon as IconSvgDescriptor;
const UploadOutlinedIcon = descriptorData.uploadOutlinedIcon as IconSvgDescriptor;
const UserOutlinedIcon = descriptorData.userOutlinedIcon as IconSvgDescriptor;
const WarningOutlinedIcon = descriptorData.warningOutlinedIcon as IconSvgDescriptor;
const ZoomInOutlinedIcon = descriptorData.zoomInOutlinedIcon as IconSvgDescriptor;
const ZoomOutOutlinedIcon = descriptorData.zoomOutOutlinedIcon as IconSvgDescriptor;

export interface WrappedIconProps {
  className?: string;
  style?: CSSProperties;
  spin?: boolean;
  rotate?: number;
  size?: number | string;
  tone?: StatusKind;
  onClick?: MouseEventHandler<HTMLSpanElement>;
  'aria-label'?: string;
  role?: string;
  tabIndex?: number;
}

export type WrappedIcon = (props: WrappedIconProps) => ReactNode;

/**
 * Single policy factory for all 141 icons (D-09/D-18).
 * Tone uses the D-12 status map; spin/rotate and caller style win.
 * The injected SVG body comes only from static vendored descriptors.
 */
export function wrapIcon(descriptor: IconSvgDescriptor): WrappedIcon {
  return function PolicyIcon({
    size,
    tone,
    spin,
    rotate,
    style,
    className,
    'aria-label': ariaLabel,
    role,
    onClick,
    tabIndex,
  }: WrappedIconProps) {
    const { mode } = useThemeMode();
    const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
    const metrics = getSharedControlTokens();
    const resolvedStyle = {
      '--ui-control-height': `${metrics.controlHeight}px`,
      fontSize: typeof size === 'number' ? `${size}px` : size ?? metrics.iconSize,
      ...(tone ? { color: getStatusTokens(tone, mode) } : {}),
      ...(rotate ? { transform: `rotate(${rotate}deg)` } : {}),
      ...style,
    } as CSSProperties;
    const html = descriptor.body.replace(/__ID__/g, `i${uid}-`);
    const classes = [styles.icon, descriptor.mono && styles.mono, spin && styles.spin, className]
      .filter(Boolean)
      .join(' ');
    return (
      <svg
        data-oi-control="icon"
        className={classes}
        viewBox={descriptor.viewBox}
        fill="none"
        width={typeof size === 'number' ? size : undefined}
        height={typeof size === 'number' ? size : undefined}
        aria-hidden={ariaLabel ? undefined : true}
        role={ariaLabel ? (role ?? 'img') : undefined}
        aria-label={ariaLabel}
        focusable="false"
        tabIndex={tabIndex}
        style={resolvedStyle}
        onClick={onClick as unknown as MouseEventHandler<SVGSVGElement>}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  };
}

// Generated export block — names and order locked by the 257-export guard.
export const ApartmentOutlined = wrapIcon(ApartmentOutlinedIcon);
export const ApiOutlined = wrapIcon(ApiOutlinedIcon);
export const AppstoreOutlined = wrapIcon(AppstoreOutlinedIcon);
export const ArrowLeftOutlined = wrapIcon(ArrowLeftOutlinedIcon);
export const ArrowRightOutlined = wrapIcon(ArrowRightOutlinedIcon);
export const ArrowUpOutlined = wrapIcon(ArrowUpOutlinedIcon);
export const BarChartOutlined = wrapIcon(BarChartOutlinedIcon);
export const BellOutlined = wrapIcon(BellOutlinedIcon);
export const BookOutlined = wrapIcon(BookOutlinedIcon);
export const BranchesOutlined = wrapIcon(BranchesOutlinedIcon);
export const BugOutlined = wrapIcon(BugOutlinedIcon);
export const BulbOutlined = wrapIcon(BulbOutlinedIcon);
export const CalendarOutlined = wrapIcon(CalendarOutlinedIcon);
export const CameraOutlined = wrapIcon(CameraOutlinedIcon);
export const CaretDownOutlined = wrapIcon(CaretDownOutlinedIcon);
export const CaretRightOutlined = wrapIcon(CaretRightOutlinedIcon);
export const CheckCircleFilled = wrapIcon(CheckCircleFilledIcon);
export const CheckCircleOutlined = wrapIcon(CheckCircleOutlinedIcon);
export const CheckOutlined = wrapIcon(CheckOutlinedIcon);
export const CheckSquareOutlined = wrapIcon(CheckSquareOutlinedIcon);
export const ClearOutlined = wrapIcon(ClearOutlinedIcon);
export const ClockCircleOutlined = wrapIcon(ClockCircleOutlinedIcon);
export const CloseCircleOutlined = wrapIcon(CloseCircleOutlinedIcon);
export const CloseOutlined = wrapIcon(CloseOutlinedIcon);
export const CloudDownloadOutlined = wrapIcon(CloudDownloadOutlinedIcon);
export const CloudOutlined = wrapIcon(CloudOutlinedIcon);
export const CloudServerOutlined = wrapIcon(CloudServerOutlinedIcon);
export const CloudSyncOutlined = wrapIcon(CloudSyncOutlinedIcon);
export const CloudUploadOutlined = wrapIcon(CloudUploadOutlinedIcon);
export const CodeOutlined = wrapIcon(CodeOutlinedIcon);
export const ColumnWidthOutlined = wrapIcon(ColumnWidthOutlinedIcon);
export const CommentOutlined = wrapIcon(CommentOutlinedIcon);
export const CompassOutlined = wrapIcon(CompassOutlinedIcon);
export const ControlOutlined = wrapIcon(ControlOutlinedIcon);
export const CopyOutlined = wrapIcon(CopyOutlinedIcon);
export const CrownOutlined = wrapIcon(CrownOutlinedIcon);
export const DashboardOutlined = wrapIcon(DashboardOutlinedIcon);
export const DatabaseOutlined = wrapIcon(DatabaseOutlinedIcon);
export const DeleteOutlined = wrapIcon(DeleteOutlinedIcon);
export const DeploymentUnitOutlined = wrapIcon(DeploymentUnitOutlinedIcon);
export const DesktopOutlined = wrapIcon(DesktopOutlinedIcon);
export const DiffOutlined = wrapIcon(DiffOutlinedIcon);
export const DisconnectOutlined = wrapIcon(DisconnectOutlinedIcon);
export const DownCircleOutlined = wrapIcon(DownCircleOutlinedIcon);
export const DownOutlined = wrapIcon(DownOutlinedIcon);
export const DownloadOutlined = wrapIcon(DownloadOutlinedIcon);
export const DragOutlined = wrapIcon(DragOutlinedIcon);
export const EditOutlined = wrapIcon(EditOutlinedIcon);
export const ExclamationCircleFilled = wrapIcon(ExclamationCircleFilledIcon);
export const ExclamationCircleOutlined = wrapIcon(ExclamationCircleOutlinedIcon);
export const ExpandAltOutlined = wrapIcon(ExpandAltOutlinedIcon);
export const ExperimentFilled = wrapIcon(ExperimentFilledIcon);
export const ExperimentOutlined = wrapIcon(ExperimentOutlinedIcon);
export const ExportOutlined = wrapIcon(ExportOutlinedIcon);
export const EyeInvisibleOutlined = wrapIcon(EyeInvisibleOutlinedIcon);
export const EyeOutlined = wrapIcon(EyeOutlinedIcon);
export const FieldTimeOutlined = wrapIcon(FieldTimeOutlinedIcon);
export const FileAddOutlined = wrapIcon(FileAddOutlinedIcon);
export const FileExcelOutlined = wrapIcon(FileExcelOutlinedIcon);
export const FileMarkdownOutlined = wrapIcon(FileMarkdownOutlinedIcon);
export const FileOutlined = wrapIcon(FileOutlinedIcon);
export const FilePptOutlined = wrapIcon(FilePptOutlinedIcon);
export const FileSearchOutlined = wrapIcon(FileSearchOutlinedIcon);
export const FileTextOutlined = wrapIcon(FileTextOutlinedIcon);
export const FileWordOutlined = wrapIcon(FileWordOutlinedIcon);
export const FilterOutlined = wrapIcon(FilterOutlinedIcon);
export const FireOutlined = wrapIcon(FireOutlinedIcon);
export const FlagOutlined = wrapIcon(FlagOutlinedIcon);
export const FolderAddOutlined = wrapIcon(FolderAddOutlinedIcon);
export const FolderFilled = wrapIcon(FolderFilledIcon);
export const FolderOpenFilled = wrapIcon(FolderOpenFilledIcon);
export const FolderOpenOutlined = wrapIcon(FolderOpenOutlinedIcon);
export const FolderOutlined = wrapIcon(FolderOutlinedIcon);
export const FolderViewOutlined = wrapIcon(FolderViewOutlinedIcon);
export const FormOutlined = wrapIcon(FormOutlinedIcon);
export const FormatPainterOutlined = wrapIcon(FormatPainterOutlinedIcon);
export const FullscreenExitOutlined = wrapIcon(FullscreenExitOutlinedIcon);
export const FullscreenOutlined = wrapIcon(FullscreenOutlinedIcon);
export const FundProjectionScreenOutlined = wrapIcon(FundProjectionScreenOutlinedIcon);
export const GithubOutlined = wrapIcon(GithubOutlinedIcon);
export const GlobalOutlined = wrapIcon(GlobalOutlinedIcon);
export const HddOutlined = wrapIcon(HddOutlinedIcon);
export const HistoryOutlined = wrapIcon(HistoryOutlinedIcon);
export const HourglassOutlined = wrapIcon(HourglassOutlinedIcon);
export const ImportOutlined = wrapIcon(ImportOutlinedIcon);
export const InboxOutlined = wrapIcon(InboxOutlinedIcon);
export const InfoCircleOutlined = wrapIcon(InfoCircleOutlinedIcon);
export const KeyOutlined = wrapIcon(KeyOutlinedIcon);
export const LeftOutlined = wrapIcon(LeftOutlinedIcon);
export const LinkOutlined = wrapIcon(LinkOutlinedIcon);
export const LoadingOutlined = wrapIcon(LoadingOutlinedIcon);
export const LockOutlined = wrapIcon(LockOutlinedIcon);
export const MenuFoldOutlined = wrapIcon(MenuFoldOutlinedIcon);
export const MenuUnfoldOutlined = wrapIcon(MenuUnfoldOutlinedIcon);
export const MessageOutlined = wrapIcon(MessageOutlinedIcon);
export const MinusCircleOutlined = wrapIcon(MinusCircleOutlinedIcon);
export const MinusOutlined = wrapIcon(MinusOutlinedIcon);
export const MoonOutlined = wrapIcon(MoonOutlinedIcon);
export const MoreOutlined = wrapIcon(MoreOutlinedIcon);
export const NodeIndexOutlined = wrapIcon(NodeIndexOutlinedIcon);
export const NotificationOutlined = wrapIcon(NotificationOutlinedIcon);
export const OrderedListOutlined = wrapIcon(OrderedListOutlinedIcon);
export const PaperClipOutlined = wrapIcon(PaperClipOutlinedIcon);
export const PauseCircleOutlined = wrapIcon(PauseCircleOutlinedIcon);
export const PictureOutlined = wrapIcon(PictureOutlinedIcon);
export const PlayCircleOutlined = wrapIcon(PlayCircleOutlinedIcon);
export const PlusOutlined = wrapIcon(PlusOutlinedIcon);
export const ProjectOutlined = wrapIcon(ProjectOutlinedIcon);
export const PushpinFilled = wrapIcon(PushpinFilledIcon);
export const PushpinOutlined = wrapIcon(PushpinOutlinedIcon);
export const QuestionCircleOutlined = wrapIcon(QuestionCircleOutlinedIcon);
export const ReloadOutlined = wrapIcon(ReloadOutlinedIcon);
export const RightOutlined = wrapIcon(RightOutlinedIcon);
export const RobotOutlined = wrapIcon(RobotOutlinedIcon);
export const RocketOutlined = wrapIcon(RocketOutlinedIcon);
export const SafetyCertificateOutlined = wrapIcon(SafetyCertificateOutlinedIcon);
export const SaveOutlined = wrapIcon(SaveOutlinedIcon);
export const ScheduleOutlined = wrapIcon(ScheduleOutlinedIcon);
export const SearchOutlined = wrapIcon(SearchOutlinedIcon);
export const SendOutlined = wrapIcon(SendOutlinedIcon);
export const SettingOutlined = wrapIcon(SettingOutlinedIcon);
export const SplitCellsOutlined = wrapIcon(SplitCellsOutlinedIcon);
export const StarOutlined = wrapIcon(StarOutlinedIcon);
export const StopOutlined = wrapIcon(StopOutlinedIcon);
export const SunOutlined = wrapIcon(SunOutlinedIcon);
export const SwapOutlined = wrapIcon(SwapOutlinedIcon);
export const SyncOutlined = wrapIcon(SyncOutlinedIcon);
export const TagOutlined = wrapIcon(TagOutlinedIcon);
export const TagsOutlined = wrapIcon(TagsOutlinedIcon);
export const TeamOutlined = wrapIcon(TeamOutlinedIcon);
export const ThunderboltFilled = wrapIcon(ThunderboltFilledIcon);
export const ThunderboltOutlined = wrapIcon(ThunderboltOutlinedIcon);
export const ToolOutlined = wrapIcon(ToolOutlinedIcon);
export const UndoOutlined = wrapIcon(UndoOutlinedIcon);
export const UnlockOutlined = wrapIcon(UnlockOutlinedIcon);
export const UpOutlined = wrapIcon(UpOutlinedIcon);
export const UploadOutlined = wrapIcon(UploadOutlinedIcon);
export const UserOutlined = wrapIcon(UserOutlinedIcon);
export const WarningOutlined = wrapIcon(WarningOutlinedIcon);
export const ZoomInOutlined = wrapIcon(ZoomInOutlinedIcon);
export const ZoomOutOutlined = wrapIcon(ZoomOutOutlinedIcon);

