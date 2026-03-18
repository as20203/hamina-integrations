-- CreateTable
CREATE TABLE "HelloRecord" (
    "id" SERIAL NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HelloRecord_pkey" PRIMARY KEY ("id")
);
