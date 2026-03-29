import { Toaster as SonnerToaster } from 'sonner';

export function Toaster() {
  return (
    <SonnerToaster
      theme="dark"
      position="bottom-right"
      toastOptions={{
        style: {
          background: 'hsl(220 14% 9%)',
          border: '1px solid hsl(220 10% 18%)',
          color: 'hsl(220 14% 95%)',
        },
      }}
      richColors
      closeButton
    />
  );
}
