export const metadata = {
  title: 'Dental Insurance Mastery',
  description: 'A complete training course to master dental insurance — from basics to advanced coding, claims, appeals, and profitability.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@500;600;700;800;900&display=swap" rel="stylesheet" />
        <style>{`
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Nunito', sans-serif; background: #f7f8fa; -webkit-font-smoothing: antialiased; }
          button { font-family: 'Nunito', sans-serif; }
          input { font-family: 'Nunito', sans-serif; }
        `}</style>
      </head>
      <body>{children}</body>
    </html>
  );
}
