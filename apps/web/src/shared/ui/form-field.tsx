import type { ComponentProps } from 'react';
export interface FormFieldProps extends Omit<ComponentProps<'input'>,'id'> {
  readonly id:string;
  readonly label:string;
  readonly error?:string;
}
export function FormField({id,label,error,...input}:FormFieldProps) {
  const describedBy = [input['aria-describedby'],error?`${id}-error`:undefined].filter(Boolean).join(' ') || undefined;
  return <div style={{display:'flex',flexDirection:'column',gap:'0.25rem',maxWidth:'100%',marginBottom:'1rem'}}>
    <label htmlFor={id}>{label}</label>
    <input {...input} id={id} aria-describedby={describedBy} aria-invalid={error?true:undefined}
      style={{boxSizing:'border-box',maxWidth:'100%',font:'inherit',...input.style}} />
    {error && <p id={`${id}-error`} style={{margin:0,overflowWrap:'anywhere'}}>{error}</p>}
  </div>;
}
