import "./globals.css";

export const metadata = {
  title: "ModuPlan",
  description: "Kod bilmeden 3D mobilya tasarla ve AR'da gör"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr">
      <head>
        <script
          type="module"
          src="https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js"
          async
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
