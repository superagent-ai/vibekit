"use client";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreditCard, CheckCircle, AlertCircle, Calendar, DollarSign } from "lucide-react";
import { useGitHubAuth } from "@/hooks/use-github-auth";
import Link from "next/link";

interface Payment {
  id: string;
  date: string;
  amount: number;
  status: "paid" | "pending" | "failed";
  description: string;
}

export default function AccountSettings() {
  const { user } = useGitHubAuth();
  const [mounted, setMounted] = useState(false);
  
  // Mock data - in production this would come from your payment provider
  const currentPlan = "PRO";
  const billingCycle = "monthly";
  const nextBillingDate = "January 21, 2025";
  const monthlyPrice = 6;
  const annualPrice = 72;
  
  const recentPayments: Payment[] = [
    {
      id: "1",
      date: "December 21, 2024",
      amount: 6,
      status: "paid",
      description: "PRO Plan - Monthly"
    },
    {
      id: "2",
      date: "November 21, 2024",
      amount: 6,
      status: "paid",
      description: "PRO Plan - Monthly"
    },
    {
      id: "3",
      date: "October 21, 2024",
      amount: 6,
      status: "paid",
      description: "PRO Plan - Monthly"
    }
  ];

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <div>
        <h2 className="text-2xl font-bold mb-2">Account</h2>
        <p className="text-muted-foreground">
          Manage your subscription and billing information.
        </p>
      </div>

      {/* Current Plan */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Current Plan</CardTitle>
              <CardDescription>
                You are currently on the {currentPlan} plan
              </CardDescription>
            </div>
            <Badge variant="default" className="text-lg px-3 py-1">
              {currentPlan}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between pb-4 border-b">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">${monthlyPrice}/month</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Billed monthly • ${annualPrice}/year if paid annually
              </p>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-2 mb-1">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">Next billing date</span>
              </div>
              <p className="font-medium">{nextBillingDate}</p>
            </div>
          </div>
          
          <div className="flex gap-3">
            <Button variant="default" asChild>
              <Link href="/pricing">Change Plan</Link>
            </Button>
            <Button variant="outline">
              Cancel Subscription
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Payment Method */}
      <Card>
        <CardHeader>
          <CardTitle>Payment Method</CardTitle>
          <CardDescription>
            Manage your payment information
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-muted rounded">
                <CreditCard className="h-5 w-5" />
              </div>
              <div>
                <p className="font-medium">•••• •••• •••• 4242</p>
                <p className="text-sm text-muted-foreground">Expires 12/25</p>
              </div>
            </div>
            <Button variant="outline" size="sm">
              Update
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Recent Payments */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Payments</CardTitle>
          <CardDescription>
            Your payment history for the last 3 months
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {recentPayments.map((payment) => (
              <div key={payment.id} className="flex items-center justify-between py-3 border-b last:border-0">
                <div className="flex items-center gap-3">
                  {payment.status === "paid" ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : payment.status === "failed" ? (
                    <AlertCircle className="h-4 w-4 text-red-500" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-yellow-500" />
                  )}
                  <div>
                    <p className="font-medium">{payment.description}</p>
                    <p className="text-sm text-muted-foreground">{payment.date}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-medium">${payment.amount}.00</p>
                  <Badge 
                    variant={
                      payment.status === "paid" ? "default" : 
                      payment.status === "failed" ? "destructive" : 
                      "secondary"
                    }
                    className="text-xs"
                  >
                    {payment.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
          
          <div className="mt-4 pt-4 border-t">
            <Button variant="outline" className="w-full">
              View All Invoices
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Account Information */}
      <Card>
        <CardHeader>
          <CardTitle>Account Information</CardTitle>
          <CardDescription>
            Your account details
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Name</p>
              <p className="font-medium">{user?.name || "Not set"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">Email</p>
              <p className="font-medium">{user?.email || "Not set"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">GitHub Username</p>
              <p className="font-medium">{user?.login || "Not connected"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">Account Type</p>
              <p className="font-medium">Personal</p>
            </div>
          </div>
          
          <div className="pt-4 border-t">
            <Button variant="destructive" size="sm">
              Delete Account
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}