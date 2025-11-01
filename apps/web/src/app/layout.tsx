import './globals.css';

export const metadata = {
  title: 'ShareSaaS - P2P File Sharing',
  description: 'Secure peer-to-peer file sharing'
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ 
        margin: 0, 
        padding: 0, 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        overflowX: 'hidden',
        WebkitFontSmoothing: 'antialiased',
        MozOsxFontSmoothing: 'grayscale'
      }}>
        {children}
      </body>
    </html>
  );
}