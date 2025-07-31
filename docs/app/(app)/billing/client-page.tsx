"use client";
import Link from "next/link";

import { useSidebar } from "@/components/navbar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Settings2, Download, ChevronLeft, ChevronRight } from "lucide-react";
import type Stripe from "stripe";
import { useRouter, useSearchParams } from "next/navigation";

export default function BillingClientPage({
  portalUrl,
  productName,
  invoices,
  pagination,
}: {
  portalUrl: string;
  productName: string;
  invoices: Stripe.Invoice[];
  pagination: {
    currentPage: number;
    hasMore: boolean;
    limit: number;
  };
}) {
  const { sidebarOpen } = useSidebar();
  const router = useRouter();
  const searchParams = useSearchParams();

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", newPage.toString());
    router.push(`?${params.toString()}`);
  };
  return (
    <div
      className={cn(
        "flex-1 transition-all duration-300 ease-in-out border bg-background mt-12 mb-4 mr-5 rounded-2xl",
        sidebarOpen ? "ml-42" : "ml-14.5"
      )}
    >
      <div className="w-full p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <p className="text-lg font-medium ml-2">Billing</p>
          </div>
        </div>
      </div>
      <div className="mt-6 px-2 max-w-2xl mx-auto w-full">
        <h2 className="text-lg font-medium mb-4">Current plan</h2>
        <div className="border rounded-lg p-4 flex items-center justify-between">
          <div className="flex flex-col gap-y-2">
            <div className="flex items-center gap-x-2">
              <p className="font-medium">{productName}</p>
              <Badge
                variant="secondary"
                className="bg-green-100 text-green-600 border-green-500"
              >
                Active
              </Badge>
            </div>
            <p>You are currently on the Free plan. </p>
          </div>
          <Link href={portalUrl} target="_blank">
            <Button variant="secondary">
              <Settings2 />
              Manage Subscription
            </Button>
          </Link>
        </div>

        {/* Invoices Section */}
        <div className="mt-8">
          <h2 className="text-lg font-medium mb-4">Invoices</h2>
          <div className="space-y-3">
            {invoices.length === 0 ? (
              <p className="text-gray-500">No invoices found.</p>
            ) : (
              invoices.map((invoice) => (
                <div
                  key={invoice.id}
                  className="border rounded-lg p-4 flex items-center justify-between"
                >
                  <div className="flex flex-col gap-y-1">
                    <div className="flex items-center gap-x-2">
                      <p className="font-medium">
                        {new Date(invoice.created * 1000).toLocaleDateString()}
                      </p>
                      <Badge
                        variant={
                          invoice.status === "paid" ? "default" : "destructive"
                        }
                        className={
                          invoice.status === "paid"
                            ? "bg-green-100 text-green-600 border-green-500"
                            : ""
                        }
                      >
                        {invoice.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-600">
                      ${(invoice.amount_paid / 100).toFixed(2)} - Invoice #
                      {invoice.number}
                    </p>
                  </div>
                  {invoice.invoice_pdf && (
                    <Link href={invoice.invoice_pdf} target="_blank">
                      <Button variant="secondary">
                        <Download className="size-4" />
                        Download
                      </Button>
                    </Link>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Pagination Controls */}
          {(pagination.currentPage > 1 || pagination.hasMore) && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(pagination.currentPage - 1)}
                  disabled={pagination.currentPage === 1}
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(pagination.currentPage + 1)}
                  disabled={!pagination.hasMore}
                >
                  Next
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
              <div className="text-sm text-gray-600">
                Page {pagination.currentPage} • {invoices.length} invoices
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
