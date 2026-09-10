import Navbar from "@/components/Navbar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      <main className="flex-1" style={{ backgroundColor: "#E8F4FF" }}>
        {children}
      </main>
    </>
  );
}
