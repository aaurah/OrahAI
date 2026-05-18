import { Router, Request, Response, NextFunction } from "express";
import { config } from "../config";
import { prisma } from "@orahai/db";
import { logger } from "../utils/logger";

const router = Router();

// ── POST /api/webhooks/stripe ─────────────────────────────────────────────────

router.post(
  "/stripe",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!config.stripe.secretKey) {
        return res.status(501).json({ error: "Stripe not configured" });
      }

      const Stripe = (await import("stripe")).default;
      const stripe = new Stripe(config.stripe.secretKey);

      const sig = req.headers["stripe-signature"];
      if (!sig) {
        return res.status(400).json({ error: "Missing stripe-signature header" });
      }

      let event: ReturnType<typeof stripe.webhooks.constructEvent>;
      try {
        event = stripe.webhooks.constructEvent(
          req.body as Buffer,
          sig,
          config.stripe.webhookSecret
        );
      } catch {
        return res.status(400).json({ error: "Invalid webhook signature" });
      }

      logger.info(`Stripe webhook: ${event.type}`);

      switch (event.type) {
        case "customer.subscription.created":
        case "customer.subscription.updated": {
          const subscription = event.data.object as {
            id: string;
            status: string;
            customer: string;
            items: { data: { price: { id: string } }[] };
            current_period_start: number;
            current_period_end: number;
            cancel_at_period_end: boolean;
          };

          await prisma.subscription.updateMany({
            where: { stripeSubscriptionId: subscription.id },
            data: {
              status: mapStripeStatus(subscription.status),
              currentPeriodStart: new Date(subscription.current_period_start * 1000),
              currentPeriodEnd: new Date(subscription.current_period_end * 1000),
              cancelAtPeriodEnd: subscription.cancel_at_period_end,
            },
          });
          break;
        }

        case "customer.subscription.deleted": {
          const subscription = event.data.object as { id: string };
          await prisma.subscription.updateMany({
            where: { stripeSubscriptionId: subscription.id },
            data: { status: "CANCELLED", canceledAt: new Date() },
          });
          break;
        }

        case "invoice.payment_failed": {
          const invoice = event.data.object as { subscription: string };
          await prisma.subscription.updateMany({
            where: { stripeSubscriptionId: invoice.subscription },
            data: { status: "PAST_DUE" },
          });
          break;
        }

        default:
          logger.debug(`Unhandled Stripe event type: ${event.type}`);
      }

      res.json({ received: true });
    } catch (err) {
      next(err);
    }
  }
);

function mapStripeStatus(
  status: string
): "ACTIVE" | "PAST_DUE" | "CANCELLED" | "TRIALING" | "PAUSED" {
  const map: Record<string, "ACTIVE" | "PAST_DUE" | "CANCELLED" | "TRIALING" | "PAUSED"> = {
    active: "ACTIVE",
    past_due: "PAST_DUE",
    canceled: "CANCELLED",
    trialing: "TRIALING",
    paused: "PAUSED",
  };
  return map[status] ?? "ACTIVE";
}

export default router;
