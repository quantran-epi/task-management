import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

export interface FormGuardContextType {
  registerActiveForm: (id: string) => () => void;
  hasActiveForm: boolean;
  activeFormIds: string[];
}

const FormGuardContext = createContext<FormGuardContextType | undefined>(undefined);

export interface FormGuardProviderProps {
  children: React.ReactNode;
}

export const FormGuardProvider: React.FC<FormGuardProviderProps> = ({ children }) => {
  const [activeForms, setActiveForms] = useState<Set<string>>(() => new Set());

  const registerActiveForm = useCallback((id: string) => {
    setActiveForms((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });

    return () => {
      setActiveForms((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    };
  }, []);

  const hasActiveForm = activeForms.size > 0;
  const activeFormIds = useMemo(() => Array.from(activeForms), [activeForms]);

  const value = useMemo<FormGuardContextType>(
    () => ({
      registerActiveForm,
      hasActiveForm,
      activeFormIds,
    }),
    [registerActiveForm, hasActiveForm, activeFormIds]
  );

  return <FormGuardContext.Provider value={value}>{children}</FormGuardContext.Provider>;
};

export function useFormGuard(): FormGuardContextType {
  const context = useContext(FormGuardContext);
  if (!context) {
    // Graceful fallback if invoked outside FormGuardProvider
    return {
      registerActiveForm: () => () => {},
      hasActiveForm: false,
      activeFormIds: [],
    };
  }
  return context;
}
