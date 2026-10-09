import "./styles.css";
export const metadata = { title: "TeleConsult", description: "1-to-1 WebRTC teleconsultation MVP" };
export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="en"><body>{children}</body></html>;
}
