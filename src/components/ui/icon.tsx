import type { CSSProperties, MouseEventHandler, ReactNode } from 'react';
import {
  ApartmentOutlined as ApartmentOutlinedComponent,
  ApiOutlined as ApiOutlinedComponent,
  AppstoreOutlined as AppstoreOutlinedComponent,
  ArrowLeftOutlined as ArrowLeftOutlinedComponent,
  ArrowRightOutlined as ArrowRightOutlinedComponent,
  ArrowUpOutlined as ArrowUpOutlinedComponent,
  BarChartOutlined as BarChartOutlinedComponent,
  BellOutlined as BellOutlinedComponent,
  BookOutlined as BookOutlinedComponent,
  BranchesOutlined as BranchesOutlinedComponent,
  BugOutlined as BugOutlinedComponent,
  BulbOutlined as BulbOutlinedComponent,
  CalendarOutlined as CalendarOutlinedComponent,
  CameraOutlined as CameraOutlinedComponent,
  CaretDownOutlined as CaretDownOutlinedComponent,
  CaretRightOutlined as CaretRightOutlinedComponent,
  CheckCircleFilled as CheckCircleFilledComponent,
  CheckCircleOutlined as CheckCircleOutlinedComponent,
  CheckOutlined as CheckOutlinedComponent,
  CheckSquareOutlined as CheckSquareOutlinedComponent,
  ClearOutlined as ClearOutlinedComponent,
  ClockCircleOutlined as ClockCircleOutlinedComponent,
  CloseCircleOutlined as CloseCircleOutlinedComponent,
  CloseOutlined as CloseOutlinedComponent,
  CloudDownloadOutlined as CloudDownloadOutlinedComponent,
  CloudOutlined as CloudOutlinedComponent,
  CloudServerOutlined as CloudServerOutlinedComponent,
  CloudSyncOutlined as CloudSyncOutlinedComponent,
  CloudUploadOutlined as CloudUploadOutlinedComponent,
  CodeOutlined as CodeOutlinedComponent,
  ColumnWidthOutlined as ColumnWidthOutlinedComponent,
  CommentOutlined as CommentOutlinedComponent,
  CompassOutlined as CompassOutlinedComponent,
  ControlOutlined as ControlOutlinedComponent,
  CopyOutlined as CopyOutlinedComponent,
  CrownOutlined as CrownOutlinedComponent,
  DashboardOutlined as DashboardOutlinedComponent,
  DatabaseOutlined as DatabaseOutlinedComponent,
  DeleteOutlined as DeleteOutlinedComponent,
  DeploymentUnitOutlined as DeploymentUnitOutlinedComponent,
  DesktopOutlined as DesktopOutlinedComponent,
  DiffOutlined as DiffOutlinedComponent,
  DisconnectOutlined as DisconnectOutlinedComponent,
  DownCircleOutlined as DownCircleOutlinedComponent,
  DownOutlined as DownOutlinedComponent,
  DownloadOutlined as DownloadOutlinedComponent,
  DragOutlined as DragOutlinedComponent,
  EditOutlined as EditOutlinedComponent,
  ExclamationCircleFilled as ExclamationCircleFilledComponent,
  ExclamationCircleOutlined as ExclamationCircleOutlinedComponent,
  ExpandAltOutlined as ExpandAltOutlinedComponent,
  ExperimentFilled as ExperimentFilledComponent,
  ExperimentOutlined as ExperimentOutlinedComponent,
  ExportOutlined as ExportOutlinedComponent,
  EyeInvisibleOutlined as EyeInvisibleOutlinedComponent,
  EyeOutlined as EyeOutlinedComponent,
  FieldTimeOutlined as FieldTimeOutlinedComponent,
  FileAddOutlined as FileAddOutlinedComponent,
  FileExcelOutlined as FileExcelOutlinedComponent,
  FileMarkdownOutlined as FileMarkdownOutlinedComponent,
  FileOutlined as FileOutlinedComponent,
  FilePptOutlined as FilePptOutlinedComponent,
  FileSearchOutlined as FileSearchOutlinedComponent,
  FileTextOutlined as FileTextOutlinedComponent,
  FileWordOutlined as FileWordOutlinedComponent,
  FilterOutlined as FilterOutlinedComponent,
  FireOutlined as FireOutlinedComponent,
  FlagOutlined as FlagOutlinedComponent,
  FolderAddOutlined as FolderAddOutlinedComponent,
  FolderFilled as FolderFilledComponent,
  FolderOpenFilled as FolderOpenFilledComponent,
  FolderOpenOutlined as FolderOpenOutlinedComponent,
  FolderOutlined as FolderOutlinedComponent,
  FolderViewOutlined as FolderViewOutlinedComponent,
  FormOutlined as FormOutlinedComponent,
  FormatPainterOutlined as FormatPainterOutlinedComponent,
  FullscreenExitOutlined as FullscreenExitOutlinedComponent,
  FullscreenOutlined as FullscreenOutlinedComponent,
  FundProjectionScreenOutlined as FundProjectionScreenOutlinedComponent,
  GithubOutlined as GithubOutlinedComponent,
  GlobalOutlined as GlobalOutlinedComponent,
  HddOutlined as HddOutlinedComponent,
  HistoryOutlined as HistoryOutlinedComponent,
  HourglassOutlined as HourglassOutlinedComponent,
  ImportOutlined as ImportOutlinedComponent,
  InboxOutlined as InboxOutlinedComponent,
  InfoCircleOutlined as InfoCircleOutlinedComponent,
  KeyOutlined as KeyOutlinedComponent,
  LeftOutlined as LeftOutlinedComponent,
  LinkOutlined as LinkOutlinedComponent,
  LoadingOutlined as LoadingOutlinedComponent,
  LockOutlined as LockOutlinedComponent,
  MenuFoldOutlined as MenuFoldOutlinedComponent,
  MenuUnfoldOutlined as MenuUnfoldOutlinedComponent,
  MessageOutlined as MessageOutlinedComponent,
  MinusCircleOutlined as MinusCircleOutlinedComponent,
  MinusOutlined as MinusOutlinedComponent,
  MoonOutlined as MoonOutlinedComponent,
  MoreOutlined as MoreOutlinedComponent,
  NodeIndexOutlined as NodeIndexOutlinedComponent,
  NotificationOutlined as NotificationOutlinedComponent,
  OrderedListOutlined as OrderedListOutlinedComponent,
  PaperClipOutlined as PaperClipOutlinedComponent,
  PauseCircleOutlined as PauseCircleOutlinedComponent,
  PictureOutlined as PictureOutlinedComponent,
  PlayCircleOutlined as PlayCircleOutlinedComponent,
  PlusOutlined as PlusOutlinedComponent,
  ProjectOutlined as ProjectOutlinedComponent,
  PushpinFilled as PushpinFilledComponent,
  PushpinOutlined as PushpinOutlinedComponent,
  QuestionCircleOutlined as QuestionCircleOutlinedComponent,
  ReloadOutlined as ReloadOutlinedComponent,
  RightOutlined as RightOutlinedComponent,
  RobotOutlined as RobotOutlinedComponent,
  RocketOutlined as RocketOutlinedComponent,
  SafetyCertificateOutlined as SafetyCertificateOutlinedComponent,
  SaveOutlined as SaveOutlinedComponent,
  ScheduleOutlined as ScheduleOutlinedComponent,
  SearchOutlined as SearchOutlinedComponent,
  SendOutlined as SendOutlinedComponent,
  SettingOutlined as SettingOutlinedComponent,
  SplitCellsOutlined as SplitCellsOutlinedComponent,
  StarOutlined as StarOutlinedComponent,
  StopOutlined as StopOutlinedComponent,
  SunOutlined as SunOutlinedComponent,
  SwapOutlined as SwapOutlinedComponent,
  SyncOutlined as SyncOutlinedComponent,
  TagOutlined as TagOutlinedComponent,
  TagsOutlined as TagsOutlinedComponent,
  TeamOutlined as TeamOutlinedComponent,
  ThunderboltFilled as ThunderboltFilledComponent,
  ThunderboltOutlined as ThunderboltOutlinedComponent,
  ToolOutlined as ToolOutlinedComponent,
  UndoOutlined as UndoOutlinedComponent,
  UnlockOutlined as UnlockOutlinedComponent,
  UpOutlined as UpOutlinedComponent,
  UploadOutlined as UploadOutlinedComponent,
  UserOutlined as UserOutlinedComponent,
  WarningOutlined as WarningOutlinedComponent,
  ZoomInOutlined as ZoomInOutlinedComponent,
  ZoomOutOutlined as ZoomOutOutlinedComponent,
} from '@ant-design/icons';

import { getSharedControlTokens, type StatusKind } from './tokens.contract';

type AntIconComponent = (props: Record<string, unknown>) => ReactNode;

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
 * Single policy factory for all AntD icons (D-09/D-18).
 * Defaults come from tokens.contract; tone maps to the shared status map.
 */
export function wrapIcon(Component: AntIconComponent): WrappedIcon {
  return function PolicyIcon({ size, tone, style, ...rest }: WrappedIconProps) {
    const metrics = getSharedControlTokens();
    const glyphSize = typeof size === 'number' ? `${size}px` : size ?? metrics.iconSize;
    // ponytail: status color comes from the shell's --success/--warning/... CSS vars,
    // so icons no longer subscribe to theme broadcasts individually (render cost).
    const resolvedStyle = {
      '--ui-control-height': `${metrics.controlHeight}px`,
      flex: '0 0 auto',
      lineHeight: 1,
      fontSize: glyphSize,
      ...(tone ? { color: `var(--${tone}, currentColor)` } : {}),
      ...style,
    } as CSSProperties;
    return <Component {...rest} style={resolvedStyle} />;
  };
}

// Generated export block — keep exact AntD names for a pure import-path migration.
export const ApartmentOutlined = wrapIcon(ApartmentOutlinedComponent);
export const ApiOutlined = wrapIcon(ApiOutlinedComponent);
export const AppstoreOutlined = wrapIcon(AppstoreOutlinedComponent);
export const ArrowLeftOutlined = wrapIcon(ArrowLeftOutlinedComponent);
export const ArrowRightOutlined = wrapIcon(ArrowRightOutlinedComponent);
export const ArrowUpOutlined = wrapIcon(ArrowUpOutlinedComponent);
export const BarChartOutlined = wrapIcon(BarChartOutlinedComponent);
export const BellOutlined = wrapIcon(BellOutlinedComponent);
export const BookOutlined = wrapIcon(BookOutlinedComponent);
export const BranchesOutlined = wrapIcon(BranchesOutlinedComponent);
export const BugOutlined = wrapIcon(BugOutlinedComponent);
export const BulbOutlined = wrapIcon(BulbOutlinedComponent);
export const CalendarOutlined = wrapIcon(CalendarOutlinedComponent);
export const CameraOutlined = wrapIcon(CameraOutlinedComponent);
export const CaretDownOutlined = wrapIcon(CaretDownOutlinedComponent);
export const CaretRightOutlined = wrapIcon(CaretRightOutlinedComponent);
export const CheckCircleFilled = wrapIcon(CheckCircleFilledComponent);
export const CheckCircleOutlined = wrapIcon(CheckCircleOutlinedComponent);
export const CheckOutlined = wrapIcon(CheckOutlinedComponent);
export const CheckSquareOutlined = wrapIcon(CheckSquareOutlinedComponent);
export const ClearOutlined = wrapIcon(ClearOutlinedComponent);
export const ClockCircleOutlined = wrapIcon(ClockCircleOutlinedComponent);
export const CloseCircleOutlined = wrapIcon(CloseCircleOutlinedComponent);
export const CloseOutlined = wrapIcon(CloseOutlinedComponent);
export const CloudDownloadOutlined = wrapIcon(CloudDownloadOutlinedComponent);
export const CloudOutlined = wrapIcon(CloudOutlinedComponent);
export const CloudServerOutlined = wrapIcon(CloudServerOutlinedComponent);
export const CloudSyncOutlined = wrapIcon(CloudSyncOutlinedComponent);
export const CloudUploadOutlined = wrapIcon(CloudUploadOutlinedComponent);
export const CodeOutlined = wrapIcon(CodeOutlinedComponent);
export const ColumnWidthOutlined = wrapIcon(ColumnWidthOutlinedComponent);
export const CommentOutlined = wrapIcon(CommentOutlinedComponent);
export const CompassOutlined = wrapIcon(CompassOutlinedComponent);
export const ControlOutlined = wrapIcon(ControlOutlinedComponent);
export const CopyOutlined = wrapIcon(CopyOutlinedComponent);
export const CrownOutlined = wrapIcon(CrownOutlinedComponent);
export const DashboardOutlined = wrapIcon(DashboardOutlinedComponent);
export const DatabaseOutlined = wrapIcon(DatabaseOutlinedComponent);
export const DeleteOutlined = wrapIcon(DeleteOutlinedComponent);
export const DeploymentUnitOutlined = wrapIcon(DeploymentUnitOutlinedComponent);
export const DesktopOutlined = wrapIcon(DesktopOutlinedComponent);
export const DiffOutlined = wrapIcon(DiffOutlinedComponent);
export const DisconnectOutlined = wrapIcon(DisconnectOutlinedComponent);
export const DownCircleOutlined = wrapIcon(DownCircleOutlinedComponent);
export const DownOutlined = wrapIcon(DownOutlinedComponent);
export const DownloadOutlined = wrapIcon(DownloadOutlinedComponent);
export const DragOutlined = wrapIcon(DragOutlinedComponent);
export const EditOutlined = wrapIcon(EditOutlinedComponent);
export const ExclamationCircleFilled = wrapIcon(ExclamationCircleFilledComponent);
export const ExclamationCircleOutlined = wrapIcon(ExclamationCircleOutlinedComponent);
export const ExpandAltOutlined = wrapIcon(ExpandAltOutlinedComponent);
export const ExperimentFilled = wrapIcon(ExperimentFilledComponent);
export const ExperimentOutlined = wrapIcon(ExperimentOutlinedComponent);
export const ExportOutlined = wrapIcon(ExportOutlinedComponent);
export const EyeInvisibleOutlined = wrapIcon(EyeInvisibleOutlinedComponent);
export const EyeOutlined = wrapIcon(EyeOutlinedComponent);
export const FieldTimeOutlined = wrapIcon(FieldTimeOutlinedComponent);
export const FileAddOutlined = wrapIcon(FileAddOutlinedComponent);
export const FileExcelOutlined = wrapIcon(FileExcelOutlinedComponent);
export const FileMarkdownOutlined = wrapIcon(FileMarkdownOutlinedComponent);
export const FileOutlined = wrapIcon(FileOutlinedComponent);
export const FilePptOutlined = wrapIcon(FilePptOutlinedComponent);
export const FileSearchOutlined = wrapIcon(FileSearchOutlinedComponent);
export const FileTextOutlined = wrapIcon(FileTextOutlinedComponent);
export const FileWordOutlined = wrapIcon(FileWordOutlinedComponent);
export const FilterOutlined = wrapIcon(FilterOutlinedComponent);
export const FireOutlined = wrapIcon(FireOutlinedComponent);
export const FlagOutlined = wrapIcon(FlagOutlinedComponent);
export const FolderAddOutlined = wrapIcon(FolderAddOutlinedComponent);
export const FolderFilled = wrapIcon(FolderFilledComponent);
export const FolderOpenFilled = wrapIcon(FolderOpenFilledComponent);
export const FolderOpenOutlined = wrapIcon(FolderOpenOutlinedComponent);
export const FolderOutlined = wrapIcon(FolderOutlinedComponent);
export const FolderViewOutlined = wrapIcon(FolderViewOutlinedComponent);
export const FormOutlined = wrapIcon(FormOutlinedComponent);
export const FormatPainterOutlined = wrapIcon(FormatPainterOutlinedComponent);
export const FullscreenExitOutlined = wrapIcon(FullscreenExitOutlinedComponent);
export const FullscreenOutlined = wrapIcon(FullscreenOutlinedComponent);
export const FundProjectionScreenOutlined = wrapIcon(FundProjectionScreenOutlinedComponent);
export const GithubOutlined = wrapIcon(GithubOutlinedComponent);
export const GlobalOutlined = wrapIcon(GlobalOutlinedComponent);
export const HddOutlined = wrapIcon(HddOutlinedComponent);
export const HistoryOutlined = wrapIcon(HistoryOutlinedComponent);
export const HourglassOutlined = wrapIcon(HourglassOutlinedComponent);
export const ImportOutlined = wrapIcon(ImportOutlinedComponent);
export const InboxOutlined = wrapIcon(InboxOutlinedComponent);
export const InfoCircleOutlined = wrapIcon(InfoCircleOutlinedComponent);
export const KeyOutlined = wrapIcon(KeyOutlinedComponent);
export const LeftOutlined = wrapIcon(LeftOutlinedComponent);
export const LinkOutlined = wrapIcon(LinkOutlinedComponent);
export const LoadingOutlined = wrapIcon(LoadingOutlinedComponent);
export const LockOutlined = wrapIcon(LockOutlinedComponent);
export const MenuFoldOutlined = wrapIcon(MenuFoldOutlinedComponent);
export const MenuUnfoldOutlined = wrapIcon(MenuUnfoldOutlinedComponent);
export const MessageOutlined = wrapIcon(MessageOutlinedComponent);
export const MinusCircleOutlined = wrapIcon(MinusCircleOutlinedComponent);
export const MinusOutlined = wrapIcon(MinusOutlinedComponent);
export const MoonOutlined = wrapIcon(MoonOutlinedComponent);
export const MoreOutlined = wrapIcon(MoreOutlinedComponent);
export const NodeIndexOutlined = wrapIcon(NodeIndexOutlinedComponent);
export const NotificationOutlined = wrapIcon(NotificationOutlinedComponent);
export const OrderedListOutlined = wrapIcon(OrderedListOutlinedComponent);
export const PaperClipOutlined = wrapIcon(PaperClipOutlinedComponent);
export const PauseCircleOutlined = wrapIcon(PauseCircleOutlinedComponent);
export const PictureOutlined = wrapIcon(PictureOutlinedComponent);
export const PlayCircleOutlined = wrapIcon(PlayCircleOutlinedComponent);
export const PlusOutlined = wrapIcon(PlusOutlinedComponent);
export const ProjectOutlined = wrapIcon(ProjectOutlinedComponent);
export const PushpinFilled = wrapIcon(PushpinFilledComponent);
export const PushpinOutlined = wrapIcon(PushpinOutlinedComponent);
export const QuestionCircleOutlined = wrapIcon(QuestionCircleOutlinedComponent);
export const ReloadOutlined = wrapIcon(ReloadOutlinedComponent);
export const RightOutlined = wrapIcon(RightOutlinedComponent);
export const RobotOutlined = wrapIcon(RobotOutlinedComponent);
export const RocketOutlined = wrapIcon(RocketOutlinedComponent);
export const SafetyCertificateOutlined = wrapIcon(SafetyCertificateOutlinedComponent);
export const SaveOutlined = wrapIcon(SaveOutlinedComponent);
export const ScheduleOutlined = wrapIcon(ScheduleOutlinedComponent);
export const SearchOutlined = wrapIcon(SearchOutlinedComponent);
export const SendOutlined = wrapIcon(SendOutlinedComponent);
export const SettingOutlined = wrapIcon(SettingOutlinedComponent);
export const SplitCellsOutlined = wrapIcon(SplitCellsOutlinedComponent);
export const StarOutlined = wrapIcon(StarOutlinedComponent);
export const StopOutlined = wrapIcon(StopOutlinedComponent);
export const SunOutlined = wrapIcon(SunOutlinedComponent);
export const SwapOutlined = wrapIcon(SwapOutlinedComponent);
export const SyncOutlined = wrapIcon(SyncOutlinedComponent);
export const TagOutlined = wrapIcon(TagOutlinedComponent);
export const TagsOutlined = wrapIcon(TagsOutlinedComponent);
export const TeamOutlined = wrapIcon(TeamOutlinedComponent);
export const ThunderboltFilled = wrapIcon(ThunderboltFilledComponent);
export const ThunderboltOutlined = wrapIcon(ThunderboltOutlinedComponent);
export const ToolOutlined = wrapIcon(ToolOutlinedComponent);
export const UndoOutlined = wrapIcon(UndoOutlinedComponent);
export const UnlockOutlined = wrapIcon(UnlockOutlinedComponent);
export const UpOutlined = wrapIcon(UpOutlinedComponent);
export const UploadOutlined = wrapIcon(UploadOutlinedComponent);
export const UserOutlined = wrapIcon(UserOutlinedComponent);
export const WarningOutlined = wrapIcon(WarningOutlinedComponent);
export const ZoomInOutlined = wrapIcon(ZoomInOutlinedComponent);
export const ZoomOutOutlined = wrapIcon(ZoomOutOutlinedComponent);
