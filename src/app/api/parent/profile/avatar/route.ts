import { del, put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AuthError, requireParent } from "@/modules/auth";

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(req: Request) {
  let uploadedUrl: string | undefined;
  try {
    const { user } = await requireParent(req);
    const form = await req.formData();
    const image = form.get("image");
    if (!(image instanceof File)) return NextResponse.json({ error: "Choose a profile image to upload." }, { status: 400 });
    if (!ALLOWED_IMAGE_TYPES.has(image.type)) return NextResponse.json({ error: "Use a JPG, PNG, or WebP image." }, { status: 400 });
    if (image.size === 0 || image.size > MAX_IMAGE_SIZE) return NextResponse.json({ error: "The image must be smaller than 5 MB." }, { status: 400 });

    const extension = image.type === "image/jpeg" ? "jpg" : image.type.split("/")[1];
    const oldProfile = await prisma.guardian.findUnique({ where: { id: user.id }, select: { avatarUrl: true } });
    const blob = await put(`parent-avatars/${user.id}/avatar.${extension}`, image, {
      access: "public",
      addRandomSuffix: true,
      contentType: image.type,
      cacheControlMaxAge: 60 * 60 * 24 * 30,
    });
    uploadedUrl = blob.url;
    const profile = await prisma.guardian.update({ where: { id: user.id }, data: { avatarUrl: blob.url }, select: { id: true, name: true, avatarUrl: true } });
    if (oldProfile?.avatarUrl) await del(oldProfile.avatarUrl).catch((error: unknown) => console.error("[ParentProfile:avatar:cleanup]", error instanceof Error ? error.message : error));
    return NextResponse.json({ profile });
  } catch (error) {
    if (uploadedUrl) await del(uploadedUrl).catch(() => undefined);
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    console.error("[ParentProfile:avatar]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Unable to upload your profile image." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { user } = await requireParent(req);
    const existing = await prisma.guardian.findUnique({ where: { id: user.id }, select: { avatarUrl: true } });
    const profile = await prisma.guardian.update({ where: { id: user.id }, data: { avatarUrl: null }, select: { id: true, name: true, avatarUrl: true } });
    if (existing?.avatarUrl) await del(existing.avatarUrl).catch((error: unknown) => console.error("[ParentProfile:avatar:cleanup]", error instanceof Error ? error.message : error));
    return NextResponse.json({ profile });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    console.error("[ParentProfile:avatar:DELETE]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Unable to remove your profile image." }, { status: 500 });
  }
}
