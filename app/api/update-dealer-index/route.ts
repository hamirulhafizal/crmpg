import { NextResponse } from 'next/server';
import { updateDealerIndex } from '../../lib/data';

export async function POST() {
  try {
    await updateDealerIndex();
    return NextResponse.json(
      { success: true, message: "Dealer index updated successfully" },
      {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        }
      }
    );
  } catch (error) {
    console.error("Error updating dealer index:", error);
    return NextResponse.json(
      { error: "Failed to update dealer index" }, 
      { status: 500 }
    );
  }
} 