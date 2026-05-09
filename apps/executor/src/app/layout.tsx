import "./global.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const metadata = {
    title: "Executor",
    description: "LangGraph-powered execution agent",
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en" className={cn("font-sans", geist.variable)}>
            <body>
                <TooltipProvider>{children}</TooltipProvider>
            </body>
        </html>
    );
}
