import { Form as AntForm, type FormProps as AntFormProps, type FormInstance } from 'antd';
import type { CSSProperties, ReactNode } from 'react';
import { getSharedControlTokens } from './tokens.contract';

/** Label placement policy; AntD-compatible plus a compact default. */
export type FormLabelPolicy = 'top' | 'left' | 'inline';

export interface FormProps extends AntFormProps {
  labelPolicy?: FormLabelPolicy;
  children?: ReactNode;
}

/** Label/validation metrics from the shared contract, exposed as custom properties. */
export function formStyle(): CSSProperties {
  const { fontSize, controlHeight } = getSharedControlTokens();
  return {
    '--ui-control-font-size': `${fontSize}px`,
    '--ui-control-height': `${controlHeight}px`,
  } as CSSProperties;
}

/** Single swap point for AntD Form plus its mirrored statics (no empty sub-wrapper). */
export function Form({ labelPolicy = 'top', style, ...rest }: FormProps) {
  const layout = labelPolicy === 'inline' ? 'inline' : labelPolicy === 'left' ? 'horizontal' : 'vertical';
  return (
    <AntForm
      {...rest}
      layout={layout}
      requiredMark={rest.requiredMark ?? true}
      style={{ ...formStyle(), ...style }}
    />
  );
}

export const FormItem = AntForm.Item;
export const FormList = AntForm.List;
export const FormErrorList = AntForm.ErrorList;
export const useForm = AntForm.useForm;
export const useWatch = AntForm.useWatch;
export type { FormInstance };
