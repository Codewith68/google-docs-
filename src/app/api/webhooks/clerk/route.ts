import { prisma } from "@/lib/prisma";

/**
 * Clerk Webhook handler for syncing user data to PostgreSQL.
 * Configure this webhook URL in Clerk Dashboard → Webhooks.
 * Subscribe to: user.created, user.updated, user.deleted
 */
export async function POST(req: Request) {
  const body = await req.text();
  // For development without webhook verification, just parse the body
  let evt: Record<string, unknown>;
  
  try {
    evt = JSON.parse(body);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const eventType = evt.type as string;
  const data = evt.data as Record<string, unknown>;

  try {
    switch (eventType) {
      case "user.created":
      case "user.updated": {
        const emailAddresses = data.email_addresses as Array<{ email_address: string }>;
        const email = emailAddresses?.[0]?.email_address || "";
        const firstName = (data.first_name as string) || "";
        const lastName = (data.last_name as string) || "";
        const name = `${firstName} ${lastName}`.trim() || "Anonymous";
        const avatar = data.image_url as string | null;

        await prisma.user.upsert({
          where: { id: data.id as string },
          update: { email, name, avatar },
          create: {
            id: data.id as string,
            email,
            name,
            avatar,
          },
        });
        break;
      }

      case "user.deleted": {
        // Soft handling — don't delete user record to preserve document ownership
        // In production, you'd handle document ownership transfer
        console.log(`User ${data.id} deleted from Clerk`);
        break;
      }
    }

    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response("Internal error", { status: 500 });
  }
}
