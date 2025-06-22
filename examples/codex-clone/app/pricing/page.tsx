"use client";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PricingPage() {
  const plans = [
    {
      name: "FREE",
      price: "$0",
      description: "Perfect for trying out codex-clone",
      features: [
        "Unlimited tasks",
        "Blended Inference with LFG-1",
        "10 concurrent workflows",
        "AI support",
        "Private and public repos",
        "No throttling, no execution time limits",
        "Third party integrations",
        "MCP support"
      ],
      buttonText: "Get Started",
      buttonVariant: "outline" as const
    },
    {
      name: "PRO",
      price: "$6",
      period: "/month",
      annualPrice: "$72/year",
      originalPrice: "$10",
      discount: "40% OFF",
      description: "For professional developers",
      features: [
        "Everything in Free",
        "Bring your own providers",
        "Extensive analytics",
        "Priority support",
        "Teams",
        "Bring your own task runner",
        "Intelligent learning",
        "Faster onboarding"
      ],
      buttonText: "Upgrade to Pro",
      buttonVariant: "default" as const,
      popular: true
    },
    {
      name: "MAX",
      price: "$60",
      period: "/month",
      annualPrice: "$720/year",
      originalPrice: "$100",
      discount: "40% OFF",
      description: "For teams and enterprises",
      features: [
        "Everything in Pro",
        "Unlimited workflows",
        "One-to-one support",
        "Bespoke plugins",
        "Workflows",
        "Onboard human developers",
        "Train human developers"
      ],
      buttonText: "Upgrade to Max",
      buttonVariant: "outline" as const
    }
  ];

  return (
    <div className="container mx-auto px-4 py-12 max-w-6xl">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-4">No BS pricing, all LFG</h1>
        <p className="text-xl text-muted-foreground">
          Start for free and grow as you need
        </p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {plans.map((plan) => (
          <div
            key={plan.name}
            className="relative"
          >
            {plan.popular && (
              <>
                {/* Animated gradient border for popular plan */}
                <div className="absolute -inset-0.5 rounded-lg opacity-75">
                  <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-blue-500/50 via-purple-500/50 to-pink-500/50 blur-sm animate-gradient-x" />
                </div>
              </>
            )}
            <div
              className={`relative rounded-lg border p-8 ${
                plan.popular 
                  ? 'border-transparent bg-background' 
                  : 'border-muted'
              }`}
            >
            {plan.popular && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-primary text-primary-foreground text-sm font-medium rounded-full">
                Most Popular
              </div>
            )}
            
            <div className="mb-6">
              <h2 className="text-2xl font-bold mb-2">{plan.name}</h2>
              <div className="mb-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-bold">{plan.price}</span>
                  {plan.period && (
                    <span className="text-muted-foreground">{plan.period}</span>
                  )}
                  {plan.originalPrice && (
                    <span className="text-lg text-muted-foreground line-through">{plan.originalPrice}</span>
                  )}
                  {plan.discount && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                      {plan.discount} SPECIAL OFFER
                    </span>
                  )}
                </div>
                {plan.annualPrice && (
                  <p className="text-sm text-muted-foreground mt-1">
                    Billed annually at {plan.annualPrice}
                  </p>
                )}
              </div>
              <p className="text-muted-foreground">{plan.description}</p>
            </div>
            
            <ul className="space-y-3 mb-8">
              {plan.features.map((feature, index) => (
                <li key={index} className="flex items-start gap-2">
                  <Check className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-sm">{feature}</span>
                </li>
              ))}
            </ul>
            
            <Button
              className="w-full"
              variant={plan.buttonVariant}
              size="lg"
            >
              {plan.buttonText}
            </Button>
            </div>
          </div>
        ))}
      </div>
      
      <div className="mt-16 text-center">
        <h3 className="text-2xl font-semibold mb-4">
          Frequently asked questions
        </h3>
        <div className="max-w-2xl mx-auto space-y-6 text-left">
          <div>
            <h4 className="font-medium mb-2">Can I switch plans anytime?</h4>
            <p className="text-muted-foreground">
              Yes, you can upgrade or downgrade your plan at any time. Changes take effect immediately.
            </p>
          </div>
          <div>
            <h4 className="font-medium mb-2">What payment methods do you accept?</h4>
            <p className="text-muted-foreground">
              We accept all major credit cards, debit cards, and PayPal.
            </p>
          </div>
          <div>
            <h4 className="font-medium mb-2">Is there a free trial for Pro or Max plans?</h4>
            <p className="text-muted-foreground">
              Yes, both Pro and Max plans come with a 14-day free trial. No credit card required.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}