// Single Phase-50 import surface (D-01). Every wrapper keeps AntD's component name,
// and every consumed prop/type is exported as a type. No bare antd re-export.
export * from './icon';

export {
  Alert,
  AlertErrorBoundary,
  type AlertProps,
} from './alert';
export {
  App,
  useApp,
  type AppProps,
} from './app';
export {
  AutoComplete,
  AutoCompleteOption,
  type AutoCompleteProps,
} from './auto-complete';
export {
  Avatar,
  AvatarGroup,
  type AvatarProps,
} from './avatar';
export {
  Badge,
  type BadgeProps,
} from './badge';
export {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbSeparator,
  type BreadcrumbProps,
} from './breadcrumb';
export {
  Button,
  IconButton,
  type ButtonProps,
  type ButtonVariant,
  type IconButtonProps,
} from './button';
export {
  Card,
  CardGrid,
  CardMeta,
  cardStyle,
  type CardProps,
} from './card';
export {
  Checkbox,
  CheckboxGroup,
  type CheckboxProps,
  type CheckboxGroupProps,
} from './checkbox';
export {
  Collapse,
  CollapsePanel,
  type CollapseProps,
} from './collapse';
export {
  DatePicker,
  DateRangePicker,
  type DateFieldProps,
  type DatePickerProps,
  type RangePickerProps,
} from './date-picker';
export {
  Descriptions,
  DescriptionsItem,
  type DescriptionsProps,
} from './descriptions';
export {
  Divider,
  type DividerProps,
} from './divider';
export {
  Drawer,
  type DrawerProps,
} from './drawer';
export {
  Dropdown,
  DropdownButton,
  type DropdownProps,
} from './dropdown';
export {
  Empty,
  EmptyImageDefault,
  EmptyImageSimple,
  type EmptyProps,
} from './empty';
export {
  Form,
  FormErrorList,
  FormItem,
  FormList,
  formStyle,
  useForm,
  useWatch,
  type FormInstance,
  type FormLabelPolicy,
  type FormProps,
} from './form';
export {
  ThemeConfigProvider,
  type ConfigProviderProps,
} from './config-provider';
export {
  useAntdToken,
  darkAlgorithm,
} from './antdTheme';
export {
  Col,
  Grid,
  Row,
  gridStyle,
  type ColProps,
  type RowProps,
} from './grid';
export {
  Image,
  ImagePreviewGroup,
  type ImageProps,
} from './image';
export {
  Input,
  InputSearch,
  controlStyle,
  controlWidthStyle,
  type InputProps,
  type InputWidth,
} from './input';
export {
  InputNumber,
  type InputNumberProps,
} from './input-number';
export {
  Layout,
  LayoutContent,
  LayoutFooter,
  LayoutHeader,
  LayoutSider,
  type LayoutProps,
  type SiderProps,
} from './layout';
export {
  List,
  ListItem,
  ListItemMeta,
  type ListProps,
} from './list';
export {
  Mentions,
  MentionsOption,
  type MentionsOptionProps,
  type MentionsProps,
  type MentionsRef,
  type MentionsWrapperProps,
} from './mentions';
export {
  Menu,
  MenuItem,
  MenuItemGroup,
  MenuSubMenu,
  type MenuProps,
  type MenuItemProps,
  type MenuRef,
  type MenuTheme,
  type MenuWrapperProps,
} from './menu';
export {
  ThemeAppHolder,
  useMessage,
} from './message';
export {
  Modal,
  getOverlayWidth,
  useTaskMateModal,
  type ModalProps,
  type OverlayWidth,
} from './modal';
export {
  useNotification,
  useNotificationConfig,
} from './notification';
export {
  Pagination,
  type PaginationProps,
} from './pagination';
export {
  Popconfirm,
  type PopconfirmProps,
} from './popconfirm';
export {
  Popover,
  type PopoverProps,
  type PopoverWrapperProps,
} from './popover';
export {
  Progress,
  type ProgressProps,
} from './progress';
export {
  Radio,
  RadioButton,
  RadioGroup,
  type RadioProps,
  type RadioButtonProps,
  type RadioGroupProps,
} from './radio';
export {
  Result,
  type ResultProps,
} from './result';
export {
  Segmented,
  type SegmentedProps,
} from './segmented';
export {
  Select,
  type SelectProps,
} from './select';
export {
  Skeleton,
  SkeletonAvatar,
  SkeletonButton,
  SkeletonImage,
  SkeletonInput,
  SkeletonNode,
  type SkeletonProps,
} from './skeleton';
export {
  Slider,
  type SliderProps,
} from './slider';
export {
  Space,
  SpaceCompact,
  type SpaceProps,
} from './space';
export {
  Spin,
  setDefaultSpinIndicator,
  type SpinProps,
} from './spin';
export {
  Splitter,
  SplitterPanel,
  type SplitterProps,
  type SplitterWrapperProps,
} from './splitter';
export {
  Statistic,
  StatisticCountdown,
  StatisticTimer,
  type StatisticProps,
} from './statistic';
export {
  StatusDot,
  type StatusDotProps,
} from './status-dot';
export {
  Switch,
  type SwitchProps,
} from './switch';
export {
  Table,
  TableSummary,
  tableStyle,
  type TableProps,
  type TableSize,
} from './table';
export {
  Tabs,
  TabPane,
  type TabsProps,
} from './tabs';
export {
  Tag,
  StatusTag,
  CheckableTag,
  type TagProps,
  type StatusTagProps,
} from './tag';
export {
  Textarea,
  TextArea,
  DEFAULT_TEXTAREA_MIN_ROWS,
  type TextareaProps,
} from './textarea';
export {
  TimePicker,
  TimeRangePicker,
  type TimeFieldProps,
  type TimePickerProps,
  type TimeRangePickerProps,
} from './time-picker';
export {
  Tooltip,
  type TooltipPlacement,
  type TooltipProps,
  type TooltipWrapperProps,
} from './tooltip';
export {
  DirectoryTree,
  Tree,
  TreeNode,
  type TreeDataNode,
  type TreeProps,
  type TreeWrapperProps,
} from './tree';
export {
  TreeSelect,
  TreeSelectNode,
  TreeSelectSHOW_ALL,
  TreeSelectSHOW_CHILD,
  TreeSelectSHOW_PARENT,
  type SelectValue,
  type TreeSelectProps,
  type TreeSelectWrapperProps,
} from './tree-select';
export {
  Paragraph,
  Text,
  Title,
  Typography,
  type FontRole,
  type ParagraphProps,
  type TextProps,
  type TitleProps,
} from './typography';
export {
  UPLOAD_LIST_IGNORE,
  Upload,
  UploadDragger,
  type UploadFile,
  type UploadProps,
  type UploadWrapperProps,
} from './upload';

export {
  getSharedControlTokens,
  getStatusTokens,
  withoutUndefined,
  type ControlSize,
  type DefinedProperties,
  type StatusKind,
  type WrapperPolicy,
} from './tokens.contract';

// Consumed AntD prop types with no separate wrapper component (D-19 type-only surface).
export type {
  InputRef,
  NotificationArgsProps,
  TableColumnsType,
  ThemeConfig,
} from 'antd';
