import { PrismaClient } from "@prisma/client";

if (process.env.NODE_ENV !== "production") {
  if (!global.prisma) {
    global.prisma = new PrismaClient();
  }
}

 const prisma = global.prisma || new PrismaClient();
(async () => {
  try {
    const wishlist = await prisma.wishlistConfig.findMany();
    console.log("Wishlist Config:", wishlist);
  } catch (error) {
    console.error("Error fetching wishlist:", error);
  }
})();
//console.log("Wishlist Config:", wishlist);
export default prisma;
