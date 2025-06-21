import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Customer Registration",
  description: "Register as a valued customer.",
};

export default function CustomerRegistrationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
} 