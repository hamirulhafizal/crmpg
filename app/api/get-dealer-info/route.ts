import { NextResponse } from 'next/server';
import { getDealerInfo } from '../../lib/data';

export async function GET() {
  try {
    const dealerInfo = await getDealerInfo();
    
    return NextResponse.json(
      dealerInfo,
      {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        }
      }
    );
  } catch (error) {
    console.error("Error fetching dealer info:", error);
    return NextResponse.json(
      { 
        username: 'default',
        name: 'Dealer',
        location: 'Malaysia',
        customers: 300,
        no_tel: '0123456789',
        image_url: 'https://via.placeholder.com/150'
      }, 
      { status: 500 }
    );
  }
} 