import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";
import { Link } from "wouter";
import { useI18n } from "@/lib/i18n";

export default function NotFound() {
  const { t, dir } = useI18n();

  return (
    <div
      className="flex min-h-screen w-full items-center justify-center bg-gray-50 px-4"
      dir={dir}
    >
      <Card className="w-full max-w-md">
        <CardContent className="pt-6 text-center">
          <div className="mb-4 flex items-center justify-center gap-2">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <h1 className="text-2xl font-bold text-gray-900">
              {t.not_found_title}
            </h1>
          </div>

          <p className="mt-4 text-sm leading-6 text-gray-600">
            {t.not_found_message}
          </p>

          <Button asChild className="mt-6">
            <Link href="/">{t.not_found_back_home}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
