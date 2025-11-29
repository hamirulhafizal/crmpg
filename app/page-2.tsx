'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';

interface DealerInfo {
  username: string;
  name?: string;
  location?: string;
  customers?: number;
  no_tel?: string;
  image_url?: string;
  email?: string;
}

interface FormData {
  fullName: string;
  icNumber: string;
  email: string;
  phone: string;
  customerAgreement: boolean;
  dealerEmail?: string;
}

export default function NewPage() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isKenapaDrawerOpen, setIsKenapaDrawerOpen] = useState(false);
  const [isDrawerAnimating, setIsDrawerAnimating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dealerInfo, setDealerInfo] = useState<DealerInfo>({
    username: 'default',
    name: 'Dealer',
    location: 'Malaysia',
    customers: 300,
    no_tel: '0123456789',
    image_url: 'https://via.placeholder.com/150',
    email: 'default'
  });
  const [isLoading, setIsLoading] = useState(true);
  const [formData, setFormData] = useState<FormData>({
    fullName: '',
    icNumber: '',
    email: '',
    phone: '',
    customerAgreement: false,
    dealerEmail: ''
  });
  const [isImageDialogOpen, setIsImageDialogOpen] = useState(false);
  const [dialogImageSrc, setDialogImageSrc] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number, y: number } | null>(null);
  const [imgOffset, setImgOffset] = useState<{ x: number, y: number }>({ x: 0, y: 0 });

  // Carousel image arrays
  const testimoniImages = Array.from({ length: 8 }, (_, i) => `/testimoni/image copy ${i}.png`);
  const gapImages = Array.from({ length: 3 }, (_, i) => `/gap/image${i}.png`);

  type CarouselType = 'testimoni' | 'gap';
  const [dialogCarousel, setDialogCarousel] = useState<CarouselType>('testimoni');
  const [dialogIndex, setDialogIndex] = useState<number>(0);

  // Call update dealer index API on page load
  useEffect(() => {
    const updateDealerIndex = async () => {
      try {
        const response = await fetch('/api/update-dealer-index', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        if (response.ok) {
          console.log('Dealer index updated successfully after page load');
        } else {
          console.error('Failed to update dealer index');
        }
      } catch (error) {
        console.error('Error updating dealer index:', error);
      }
    };
    updateDealerIndex();
  }, []);

  // Set document title with dealer URL
  useEffect(() => {
    const dealerUrl = dealerInfo.username || 'default';
    document.title = `Public Gold | ${dealerUrl}`;
  }, [dealerInfo.username]);

  useEffect(() => {
    const fetchDealerInfo = async () => {
      try {
        const response = await fetch('/api/get-dealer-info');
        if (response.ok) {
          const data = await response.json();
          // console.log("data", data);
          setDealerInfo(data);
        }
      } catch (error) {
        console.error('Error fetching dealer info:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDealerInfo();
  }, []);

  // Get first letter of dealer name for avatar
  const getInitial = (name: string) => {
    return name.charAt(0).toUpperCase();
  };

  // Handle form input changes
  const handleInputChange = (field: keyof FormData, value: string | boolean) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setIsSubmitting(true);

    try {
      // Add dealer email to the payload
      const payload = {
        ...formData,
        dealerEmail: dealerInfo.email || '', // always send current dealer email
      };

      const response = await fetch('/api/submit-form', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (result.success) {
        alert('Pendaftaran berjaya! Dealer akan menghubungi anda dalam masa 24 jam.');
        closeDrawer();
        setFormData({
          fullName: '',
          icNumber: '',
          email: '',
          phone: '',
          customerAgreement: false,
          dealerEmail: dealerInfo.email || ''
        });
      } else {
        alert('Ralat berlaku semasa menghantar borang. Sila cuba lagi.');
      }
    } catch (error) {
      alert('Ralat berlaku. Sila cuba lagi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle drawer open
  const openDrawer = () => {
    setIsDrawerOpen(true);
    setIsDrawerAnimating(true);
    document.body.style.overflow = 'hidden';

    // Trigger animation after a small delay
    setTimeout(() => {
      setIsDrawerAnimating(false);
    }, 50);
  };

  // Handle drawer close
  const closeDrawer = () => {
    setIsDrawerAnimating(true);

    // Wait for animation to complete before hiding
    setTimeout(() => {
      setIsDrawerOpen(false);
      setIsDrawerAnimating(false);
      document.body.style.overflow = 'unset';
    }, 300);
  };

  // Handle Kenapa drawer open
  const openKenapaDrawer = () => {
    setIsKenapaDrawerOpen(true);
    setIsDrawerAnimating(true);
    document.body.style.overflow = 'hidden';

    // Trigger animation after a small delay
    setTimeout(() => {
      setIsDrawerAnimating(false);
    }, 50);
  };

  // Handle Kenapa drawer close
  const closeKenapaDrawer = () => {
    setIsDrawerAnimating(true);

    // Wait for animation to complete before hiding
    setTimeout(() => {
      setIsKenapaDrawerOpen(false);
      setIsDrawerAnimating(false);
      document.body.style.overflow = 'unset';
    }, 300);
  };

  const openImageDialog = (src: string, carousel: CarouselType, index: number) => {
    setDialogImageSrc(src);
    setDialogCarousel(carousel);
    setDialogIndex(index);
    setIsImageDialogOpen(true);
    setZoom(1);
    setImgOffset({ x: 0, y: 0 });
    document.body.style.overflow = 'hidden';
  };

  const showImageAt = (carousel: CarouselType, index: number) => {
    const images = carousel === 'testimoni' ? testimoniImages : gapImages;
    const newIndex = (index + images.length) % images.length;
    setDialogImageSrc(images[newIndex]);
    setDialogIndex(newIndex);
    setZoom(1);
    setImgOffset({ x: 0, y: 0 });
  };

  const handleNext = () => {
    showImageAt(dialogCarousel, dialogIndex + 1);
  };
  const handlePrev = () => {
    showImageAt(dialogCarousel, dialogIndex - 1);
  };

  // Keyboard navigation
  useEffect(() => {
    if (!isImageDialogOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === 'ArrowLeft') handlePrev();
      if (e.key === 'Escape') closeImageDialog();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isImageDialogOpen, dialogCarousel, dialogIndex]);

  // Touch swipe navigation
  let touchStartX = 0;
  let touchEndX = 0;
  const handleDialogTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 1) touchStartX = e.touches[0].clientX;
  };
  const handleDialogTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.changedTouches.length === 1) {
      touchEndX = e.changedTouches[0].clientX;
      if (touchEndX - touchStartX > 50) handlePrev();
      if (touchStartX - touchEndX > 50) handleNext();
    }
  };

  const closeImageDialog = () => {
    setIsImageDialogOpen(false);
    setDialogImageSrc(null);
    setZoom(1);
    setImgOffset({ x: 0, y: 0 });
    document.body.style.overflow = 'unset';
  };
  const handleWheel = (e: React.WheelEvent<HTMLImageElement>) => {
    e.preventDefault();
    setZoom(z => Math.max(1, Math.min(3, z - e.deltaY * 0.002)));
  };
  const handleMouseDown = (e: React.MouseEvent<HTMLImageElement>) => {
    if (zoom === 1) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - imgOffset.x, y: e.clientY - imgOffset.y });
  };
  const handleMouseMove = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!isDragging || !dragStart) return;
    setImgOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };
  const handleMouseUp = () => {
    setIsDragging(false);
    setDragStart(null);
  };
  const handleTouchStart = (e: React.TouchEvent<HTMLImageElement>) => {
    if (e.touches.length === 2) {
      setIsDragging(false);
    } else if (zoom > 1 && e.touches.length === 1) {
      setIsDragging(true);
      setDragStart({ x: e.touches[0].clientX - imgOffset.x, y: e.touches[0].clientY - imgOffset.y });
    }
  };
  const handleTouchMove = (e: React.TouchEvent<HTMLImageElement>) => {
    if (e.touches.length === 2) {
      // Pinch zoom
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      if ((window as any)._lastPinchDist) {
        const delta = dist - (window as any)._lastPinchDist;
        setZoom(z => Math.max(1, Math.min(3, z + delta * 0.01)));
      }
      (window as any)._lastPinchDist = dist;
    } else if (isDragging && dragStart && e.touches.length === 1) {
      setImgOffset({ x: e.touches[0].clientX - dragStart.x, y: e.touches[0].clientY - dragStart.y });
    }
  };
  const handleTouchEnd = (e: React.TouchEvent<HTMLImageElement>) => {
    setIsDragging(false);
    setDragStart(null);
    (window as any)._lastPinchDist = null;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-yellow-100">
      {/* Navigation */}
      <nav className="bg-white shadow-lg sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                {/* <h1 className="text-2xl font-bold text-red">Simpan Emas</h1> */}
                <img src="/pg-logo.png" alt="Public Gold" className="w-30 h-30" />
              </div>
            </div>

            {/* Desktop Menu */}
            <div className="hidden md:block">
              <div className="ml-10 flex items-baseline space-x-4">
                <button
                  onClick={() => {
                    const element = document.getElementById('simpan-emas');
                    if (element) {
                      element.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                      });
                    }
                  }}
                  className="text-gray-700 hover:text-red-600 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200"
                >
                  Simpan Emas
                </button>
                <button
                  onClick={openKenapaDrawer}
                  className="text-gray-700 hover:text-red-600 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200"
                >
                  Kenapa Public Gold
                </button>

                <button
                  onClick={() => {
                    const element = document.getElementById('apaitugap');
                    if (element) {
                      element.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                      });
                    }
                  }}
                  className="text-gray-700 hover:text-red-600 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200"
                >
                  Apa itu GAP ?
                </button>

                <button
                  onClick={openDrawer}
                  className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors duration-200"
                >
                  Daftar Percuma
                </button>
              </div>
            </div>

            {/* Mobile menu button */}
            <div className="md:hidden">
              <button
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="text-gray-700 hover:text-red-600 focus:outline-none focus:text-red-600"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMenuOpen && (
          <div className="md:hidden">
            <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3 bg-white border-t">
              <button
                onClick={() => {
                  const element = document.getElementById('simpan-emas');
                  if (element) {
                    element.scrollIntoView({
                      behavior: 'smooth',
                      block: 'start'
                    });
                  }
                  setIsMenuOpen(false); // Close mobile menu after clicking
                }}
                className="text-gray-700 hover:text-red-600 block px-3 py-2 rounded-md text-base font-medium w-full text-left"
              >
                Simpan Emas
              </button>

              <button
                onClick={() => {
                  const element = document.getElementById('apaitugap');
                  if (element) {
                    element.scrollIntoView({
                      behavior: 'smooth',
                      block: 'start'
                    });
                  }
                }}
                className="text-gray-700 hover:text-red-600 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200"
              >
                Apa itu GAP ?
              </button>

              <button
                onClick={() => {
                  openKenapaDrawer();
                  setIsMenuOpen(false); // Close mobile menu after clicking
                }}
                className="text-gray-700 hover:text-red-600 block px-3 py-2 rounded-md text-base font-medium w-full text-left"
              >
                Kenapa Public Gold
              </button>
              <button
                onClick={() => {
                  openDrawer();
                  setIsMenuOpen(false); // Close mobile menu after clicking
                }}
                className="bg-red-600 text-white block px-3 py-2 rounded-md text-base font-medium w-full text-left"
              >
                Daftar Percuma
              </button>
            </div>
          </div>
        )}
      </nav>


      <style jsx>{`
         html {
           scroll-behavior: smooth;
         }
         
         .backgroundDrop::after {
           background-image: url(/image.png) !important;
           background-size: cover;
           background-position: center;
           background-repeat: no-repeat;
           background-color: #1d1e20;
         }
         
         /* Custom smooth scroll for better control */
         .smooth-scroll {
           scroll-behavior: smooth;
         }
       `}</style>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          {/* Background image with dark overlay */}
          <img
            src="/pg-hq.png"
            alt="Public Gold HQ"
            className="absolute inset-0 w-full h-full object-cover z-0"
            style={{ filter: 'brightness(0.8)' }}
          />
          <div className="absolute inset-0 bg-black bg-opacity-50 z-10" />
          <div className="relative z-20 text-center">
            <h1 className="text-4xl md:text-6xl font-bold text-white mb-6 leading-tight drop-shadow-lg">
              SIMPAN EMAS SERENDAH{' '}
              <span className="text-red-600">RM100</span>
            </h1>
            <p className="text-xl md:text-2xl text-white mb-8 max-w-3xl mx-auto drop-shadow">
              Mulakan simpanan emas anda hari ini - murah, mudah dan patuh syariah dengan hanya RM100
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={openDrawer}
                className="bg-red-600 text-white px-8 py-4 rounded-xl text-lg font-semibold hover:bg-red-700 transform hover:scale-105 transition-all duration-200 shadow-lg shimmer-animate"
              >
                Daftar Percuma
              </button>

            </div>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section id="simpan-emas" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16 flex flex-col justify-center items-center">
            <img className="p-5 pb-10 w-full h-70 sm:w-full sm:h-full md:w-[50vw] md:h-[70vh] object-cover" src="/menara-indoor.jpg" alt="Hero" />
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              5 Kelebihan Menyimpan Emas
            </h2>
            <p className="text-lg text-gray-600 max-w-3xl mx-auto">
              Emas sesuai dijadikan simpanan jangka panjang, <strong>sekurang-kurangnya 2 tahun</strong> dan ke atas.
              Selain nilainya terjamin, ini antara kelebihan menyimpan emas:
            </p>

            <img
              src="/gold-background.png"
              alt="Gold Background"
              className="my-10 object-cover z-0 mx-auto w-full h-80 sm:w-full sm:h-full md:w-[50vw] md:h-[70vh] rounded-xl"
              style={{ maxWidth: '100%', maxHeight: '100%' }}
            />
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              {
                title: "Duit Simpanan Tak Bocor (Kalis Boros)",
                description: "Emas tidak mudah dicairkan seperti wang tunai, membantu mengelakkan pembaziran.",
                icon: "💰"
              },
              {
                title: "Jumlah Simpanan Berganda Dengan Cepat",
                description: "Kenaikkan harga emas purata 10-15% setahun, lebih tinggi daripada simpanan bank.",
                icon: "📈"
              },
              {
                title: "Tidak Terkesan Dengan Inflasi",
                description: "Emas mengekalkan nilai walaupun dalam ketidakstabilan ekonomi atau politik.",
                icon: "🛡️"
              },
              {
                title: "Mudah Ditukar Kepada Tunai",
                description: "Boleh dipajak atau dijual bila terdesak dengan nilai yang stabil.",
                icon: "💳"
              },
              {
                title: "Mudah Diwariskan",
                description: "Proses pewarisan yang mudah jika berlaku kematian.",
                icon: "👨‍👩‍👧‍👦"
              }
            ].map((benefit, index) => (
              <div key={index} className="bg-gradient-to-br border-2 border-gray-200 from-red-50 to-yellow-100 p-8 rounded-2xl hover:shadow-xl transition-all duration-300 transform hover:-translate-y-2">
                <div className="text-4xl mb-4">{benefit.icon}</div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">{benefit.title}</h3>
                <p className="text-gray-600">{benefit.description}</p>
              </div>
            ))}
          </div>

          <div className="text-center mt-12">
            <button
              onClick={openDrawer}
              className="bg-red-600 text-white px-8 py-4 rounded-xl text-lg font-semibold hover:bg-red-700 transform hover:scale-105 transition-all duration-200 shadow-lg shimmer-animate"
            >
              Daftar Percuma
            </button>
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="relative py-20 bg-gradient-to-br from-red-50 to-yellow-100 overflow-hidden">
        {/* Background image with dark overlay */}
        <img
          src="/gold-background.png"
          alt="Gold Background"
          className="absolute inset-0 w-full h-full object-cover z-0"
          style={{ filter: 'brightness(0.7)' }}
        />
        <div className="absolute inset-0 bg-black bg-opacity-40 z-10" />
        <div className="relative z-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl text-white font-bold text-gray-900 mb-4">
                Testimoni Penyimpan Emas
              </h2>
            </div>

            <div className="flex justify-center pb-10">
              <div className="flex overflow-x-auto">
                {testimoniImages.map((src, index) => (
                  <div key={index} className="min-w-64 mx-4">
                    <img
                      src={src}
                      className="w-full h-auto object-cover rounded-lg cursor-zoom-in"
                      onClick={() => openImageDialog(src, 'testimoni', index)}
                      alt={`Testimoni ${index + 1}`}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-xl p-8 md:p-12 max-w-4xl mx-auto">
              <div className="flex items-center mb-6">

                <img src="/steven.png" alt="Public Gold" className="w-20 h-20 mr-5 rounded-full" />
                <div>
                  <h3 className="text-xl font-bold text-gray-900">Steven Blanda</h3>
                  <p className="text-gray-600">Guru, Marudi (Sarawak)</p>
                  <div className="flex text-red-500 mt-1">
                    {[...Array(5)].map((_, i) => (
                      <svg key={i} className="w-5 h-5 fill-current" viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    ))}
                  </div>
                </div>
              </div>
              <blockquote className="text-lg text-gray-700 italic leading-relaxed">
                "Dua tahun bekerja langsung tak ada saving. Lepas mula simpan emas, saya berjaya berkahwin tanpa hutang,
                selesaikan hutang kereta, dan ada saving lebih 6 bulan gaji dalam bentuk emas."
              </blockquote>
            </div>

            <div className="text-center mt-12">
              <button
                onClick={openDrawer}
                className="bg-red-600 text-white px-8 py-4 rounded-xl text-lg font-semibold hover:bg-red-700 transform hover:scale-105 transition-all duration-200 shadow-lg shimmer-animate"
              >
                Daftar Percuma
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* GAP Program Section */}
      <section className="py-20 bg-white" id="apaitugap">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6">
                Gold Accumulation Program (GAP)
              </h2>
              <p className="text-lg text-gray-600 mb-6 leading-relaxed">
                GAP adalah salah satu kaedah <strong>pembelian dan pengumpulan emas</strong> secara sedikit demi sedikit
                melalui <strong>akaun simpanan emas</strong> dengan modal <strong>serendah RM100</strong> secara atas talian.
              </p>
              <p className="text-lg text-gray-600 mb-8 leading-relaxed">
                Konsep GAP sama seperti <strong>akaun bank online</strong>, bezanya adalah akaun bank memaparkan simpanan
                dalam bentuk duit manakala GAP memaparkan <strong>simpanan dalam bentuk gram emas</strong>.
              </p>




            </div>
            <div className="bg-gradient-to-br from-red-100 to-yellow-200 rounded-2xl p-8">
              <div className="text-center">
                <div className="text-6xl mb-4">🏦</div>
                <h3 className="text-2xl font-bold text-gray-900 mb-4">Akaun Bank vs Akaun GAP</h3>
                <div className="space-y-4">
                  <div className="bg-white rounded-lg p-4 shadow-md">
                    <h4 className="font-semibold text-gray-900 mb-2">Akaun Bank</h4>
                    <p className="text-gray-600">Simpanan dalam bentuk wang tunai</p>
                  </div>
                  <div className="bg-red-100 rounded-lg p-4 shadow-md">
                    <h4 className="font-semibold text-gray-900 mb-2">Akaun GAP</h4>
                    <p className="text-gray-600">Simpanan dalam bentuk gram emas</p>
                  </div>
                </div>
              </div>
            </div>

          </div>

          <div className="flex justify-center pt-10 pb-10">
            <div className="flex overflow-x-auto">
              {gapImages.map((src, index) => (
                <div key={index} className="min-w-64 mx-4">
                  <img
                    src={src}
                    className="w-full h-auto object-cover rounded-lg cursor-zoom-in"
                    onClick={() => openImageDialog(src, 'gap', index)}
                    alt={`GAP ${index + 1}`}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-center pb-10">
            <button
              onClick={openDrawer}
              className="w-[300px] bg-red-600 text-white px-8 py-4 rounded-xl text-lg font-semibold hover:bg-red-700 transform hover:scale-105 transition-all duration-200 shadow-lg shimmer-animate"
            >
              Daftar Percuma
            </button>
          </div>


        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-black">

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">

          <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
            Daftar Sekarang Secara PERCUMA !
          </h2>
          <div className="flex flex-col sm:flex-col gap-4 justify-center mb-8">

            <div className="flex flex-col items-center justify-center">
              <button
                onClick={openDrawer}
                className="bg-white text-red-600 px-8 py-4 rounded-xl text-lg font-semibold hover:bg-gray-100 transform hover:scale-105 transition-all duration-200 shadow-lg shimmer-animate"
              >
                Klik Disini Untuk Daftar
              </button>
            </div>


            <div className="flex flex-col items-center justify-center">

              <img src="ebook.png" alt="Ebook" className=" sm:w-full sm:h-full md:w-[40vw] md:h-[50vh] object-cover rounded-lg" />

              <button onClick={() => window.open(`https://publicgoldofficial.com/app/ebook/${dealerInfo.username}#form`, '_blank')} className="border-2 border-white text-white px-8 py-4 rounded-xl text-lg font-semibold hover:bg-white hover:text-red-600 transition-all duration-200 shimmer-animate">
                Download Ebook PERCUMA
              </button>
            </div>


          </div>
        </div>
      </section>

      {/* About Section */}
      <section className="py-20 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6">
            Siapa saya?
          </h2>
          <div className="bg-gradient-to-br from-amber-50 to-yellow-100 rounded-2xl p-8 md:p-12">
            {isLoading ? (
              <div className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-600"></div>
              </div>
            ) : (
              <>
                <div className="w-50 h-50 bg-red-600 rounded-full flex items-center justify-center text-white text-3xl font-bold mx-auto mb-6">
                  <img src={dealerInfo?.image_url} alt="Dealer" className="w-50 h-50 rounded-full" />
                </div>
                <p className="text-lg text-gray-700 mb-6 leading-relaxed">
                  Saya <strong className="text-black"
                    style={{
                      textTransform: 'capitalize'
                    }}
                  >{dealerInfo.username}</strong>, Authorised Dealer Public Gold. Sehingga kini, saya telah bantu ramai orang memulakan
                  simpanan emas melalui <strong>Akaun GAP</strong> <strong>serendah RM100</strong> sahaja.
                </p>
                <p className="text-lg text-gray-700 mb-8 leading-relaxed">
                  Saya komited untuk membimbing anda dari A sampai Z. Daftar hari ini dan saya akan guide anda secara peribadi.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <button
                    onClick={openDrawer}
                    className="bg-red-600 text-white px-8 py-4 rounded-xl text-lg font-semibold hover:bg-red-700 transform hover:scale-105 transition-all duration-200 shadow-lg shimmer-animate"
                  >
                    Daftar Percuma
                  </button>
                  {/* <button onClick={() => window.open(`${dealerInfo.no_tel}`, '_blank')} className="bg-green-600 text-white px-8 py-4 rounded-xl text-lg font-semibold hover:bg-green-700 transform hover:scale-105 transition-all duration-200 shadow-lg glow-animate">
                    Whatsapp Saya
                  </button> */}
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p>&copy; 2025 PublicGoldMarketing</p>
        </div>
      </footer>

      {/* Registration Drawer */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          {/* Backdrop */}
          <div
            className={`absolute inset-0 bg-black transition-opacity duration-300 ease-in-out ${isDrawerAnimating ? 'bg-opacity-0' : 'bg-opacity-50'
              }`}
            onClick={closeDrawer}
          />

          {/* Desktop: Full width overlay */}
          <div className="hidden md:block absolute inset-0">
            <div className={`h-full w-full bg-white transform transition-transform duration-300 ease-in-out ${isDrawerAnimating ? 'translate-y-full' : 'translate-y-0'
              }`}>
              <div className="h-full flex flex-col">
                {/* Header */}
                <div className="flex-shrink-0 flex items-center justify-between p-6 border-b border-gray-200">
                  <h2 className="text-xl font-semibold text-gray-900">Daftar Akaun GAP</h2>
                  <button
                    onClick={closeDrawer}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto">
                  <div className="p-6 max-w-4xl mx-auto">
                    {/* Context */}
                    <div className="mb-6 p-4 bg-blue-50 rounded-lg">
                      <p className="text-sm text-blue-800 mb-3">
                        Simpan emas dari serendah RM100 dan mula lindungi nilai duit anda. Bimbingan penuh akan diberikan secara percuma.
                      </p>
                      <p className="text-xs text-blue-700">
                        Maklumat anda adalah selamat dan tidak akan dikongsi kepada pihak ketiga. Dengan menghantar borang ini, anda bersetuju untuk didaftarkan sebagai customer public gold dan dihubungi oleh Dealer Sah Public Gold bagi tujuan bimbingan simpanan emas.
                      </p>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl mx-auto">
                      {/* Hidden Dealer Email Field */}
                      <input
                        type="hidden"
                        id="dealerEmail"
                        value={dealerInfo.email || ''}
                      />
                      {/* Full Name */}
                      <div>
                        <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-2">
                          Nama Penuh*
                        </label>
                        <input
                          type="text"
                          id="fullName"
                          required
                          value={formData.fullName}
                          onChange={(e) => handleInputChange('fullName', e.target.value)}
                          className="w-full px-3 py-2 border text-black border-gray-300 rounded-lg focus:ring-2 focus:text-black focus:ring-red-500 focus:border-red-500 transition-colors"
                          placeholder="Masukkan nama penuh anda"
                        />
                      </div>

                      {/* IC Number */}
                      <div>
                        <label htmlFor="icNumber" className="block text-sm font-medium text-gray-700 mb-2">
                          Nombor IC*
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          id="icNumber"
                          required
                          value={formData.icNumber}
                          onChange={(e) => handleInputChange('icNumber', e.target.value.replace(/\D/g, ''))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black focus:text-black focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-colors"
                          placeholder="Contoh: 880101011234"
                          onInput={e => (e.currentTarget.value = e.currentTarget.value.replace(/\D/g, ''))}
                        />
                      </div>

                      {/* Email */}
                      <div>
                        <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                          Email*
                        </label>
                        <input
                          type="email"
                          id="email"
                          required
                          value={formData.email}
                          onChange={(e) => handleInputChange('email', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:text-black focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-colors"
                          placeholder="contoh@email.com"
                        />
                      </div>

                      {/* Phone */}
                      <div>
                        <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
                          Nombor Telefon (Whatsapp)*
                        </label>
                        <input
                          type="tel"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          id="phone"
                          required
                          value={formData.phone}
                          onChange={(e) => handleInputChange('phone', e.target.value.replace(/\D/g, ''))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black focus:text-black focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-colors"
                          placeholder="Contoh: 0123456789"
                          onInput={e => (e.currentTarget.value = e.currentTarget.value.replace(/\D/g, ''))}
                        />
                      </div>

                      {/* Agreement */}
                      <div className="space-y-4">

                        <div className="flex items-start">
                          <input
                            type="checkbox"
                            id="customerAgreement"
                            required
                            checked={formData.customerAgreement}
                            onChange={(e) => handleInputChange('customerAgreement', e.target.checked)}
                            className="mt-1 h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300 rounded"
                          />
                          <label htmlFor="customerAgreement" className="ml-2 text-sm text-gray-700">
                            Saya bersetuju untuk membuat belian/simpanan minima RM100 dalam tempoh 24 jam setelah akaun diaktifkan. Gagal berbuat demikian, akaun public gold saya boleh dibekukan.
                          </label>
                        </div>
                      </div>

                      {/* Submit Button */}
                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full bg-red-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                      >
                        {isSubmitting ? (
                          <div className="flex items-center justify-center">
                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                            Menghantar...
                          </div>
                        ) : (
                          'Hantar Pendaftaran'
                        )}
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Mobile: Slide from bottom to up */}
          <div className="md:hidden absolute inset-x-0 bottom-0 max-h-full">
            <div className={`relative w-full transform transition-transform duration-300 ease-in-out ${isDrawerAnimating ? 'translate-y-full' : 'translate-y-0'
              }`}>
              <div className="bg-white rounded-t-2xl shadow-xl max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-200">
                  <h2 className="text-xl font-semibold text-gray-900">Daftar Akaun Public Gold</h2>
                  <button
                    onClick={closeDrawer}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                  {/* Context */}
                  <div className="mb-6 p-4 bg-blue-50 rounded-lg">
                    <p className="text-sm text-blue-800 mb-3">
                      Simpan emas dari serendah RM100 dan mula lindungi nilai duit anda. Bimbingan penuh akan diberikan secara percuma.
                    </p>
                    <p className="text-xs text-blue-700">
                      Maklumat anda adalah selamat dan tidak akan dikongsi kepada pihak ketiga. Dengan menghantar borang ini, anda bersetuju untuk didaftarkan sebagai customer public gold dan dihubungi oleh Dealer Sah Public Gold bagi tujuan bimbingan simpanan emas.
                    </p>
                  </div>

                  {/* Form */}
                  <form id="mobileRegForm" onSubmit={handleSubmit} className="space-y-6 pb-28">
                    {/* Full Name */}
                    <div>
                      <label htmlFor="fullNameMobile" className="block text-sm font-medium text-gray-700 mb-2">
                        Nama Penuh*
                      </label>
                      <input
                        type="text"
                        id="fullNameMobile"
                        required
                        value={formData.fullName}
                        onChange={(e) => handleInputChange('fullName', e.target.value)}
                        className="w-full px-3 py-2 border text-black border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-colors"
                        placeholder="Masukkan nama penuh anda"
                      />
                    </div>

                    {/* IC Number */}
                    <div>
                      <label htmlFor="icNumberMobile" className="block text-sm font-medium text-gray-700 mb-2">
                        Nombor IC*
                      </label>
                      <input
                        type="text"
                        id="icNumberMobile"
                        required
                        value={formData.icNumber}
                        onChange={(e) => handleInputChange('icNumber', e.target.value.replace(/\D/g, ''))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-colors"
                        placeholder="Contoh: 880101011234"
                        onInput={e => (e.currentTarget.value = e.currentTarget.value.replace(/\D/g, ''))}
                      />
                    </div>

                    {/* Email */}
                    <div>
                      <label htmlFor="emailMobile" className="block text-sm font-medium text-gray-700 mb-2">
                        Email*
                      </label>
                      <input
                        type="email"
                        id="emailMobile"
                        required
                        value={formData.email}
                        onChange={(e) => handleInputChange('email', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-colors"
                        placeholder="contoh@email.com"
                      />
                    </div>

                    {/* Phone */}
                    <div>
                      <label htmlFor="phoneMobile" className="block text-sm font-medium text-gray-700 mb-2">
                        Nombor Telefon (Whatsapp)*
                      </label>
                      <input
                        type="tel"
                        id="phoneMobile"
                        required
                        value={formData.phone}
                        onChange={(e) => handleInputChange('phone', e.target.value.replace(/\D/g, ''))}
                        className="w-full px-3 py-2 border text-black border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-colors"
                        placeholder="Contoh: 0123456789"
                        onInput={e => (e.currentTarget.value = e.currentTarget.value.replace(/\D/g, ''))}
                      />
                    </div>

                    {/* Agreement */}
                    <div className="space-y-4">

                      <div className="flex items-start">
                        <input
                          type="checkbox"
                          id="customerAgreementMobile"
                          required
                          checked={formData.customerAgreement}
                          onChange={(e) => handleInputChange('customerAgreement', e.target.checked)}
                          className="mt-1 h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300 rounded"
                        />
                        <label htmlFor="customerAgreementMobile" className="ml-2 text-sm text-gray-700">
                          Saya bersetuju untuk membuat belian/simpanan minima RM100 dalam tempoh 24 jam setelah akaun diaktifkan. Gagal berbuat demikian, akaun public gold saya boleh dibekukan.
                        </label>
                      </div>
                    </div>

                  </form>
                  {/* Fixed footer submit button */}
                  <div className="fixed bottom-0 left-0 right-0 md:hidden bg-white border-t border-gray-200 p-4 z-5 mb-7">
                    <button
                      type="submit"
                      form="mobileRegForm"
                      disabled={isSubmitting}
                      className="w-full bg-red-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors shimmer-animate"
                    >
                      {isSubmitting ? (
                        <div className="flex items-center justify-center">
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                          Menghantar...
                        </div>
                      ) : (
                        'Hantar Pendaftaran'
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Kenapa Public Gold Drawer */}
      {isKenapaDrawerOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          {/* Backdrop */}
          <div
            className={`absolute inset-0 bg-black transition-opacity duration-300 ease-in-out ${isDrawerAnimating ? 'bg-opacity-0' : 'bg-opacity-50'
              }`}
            onClick={closeKenapaDrawer}
          />

          {/* Desktop: Full width overlay */}
          <div className="hidden md:block absolute inset-0">
            <div className={`h-full w-full bg-white transform transition-transform duration-300 ease-in-out ${isDrawerAnimating ? 'translate-y-full' : 'translate-y-0'
              }`}>
              <div className="h-full flex flex-col">
                {/* Header */}
                <div className="flex-shrink-0 flex items-center justify-between p-6 border-b border-gray-200">
                  <h2 className="text-xl font-semibold text-gray-900">Kenapa Public Gold</h2>


                  <button
                    onClick={closeKenapaDrawer}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto">
                  <div className="p-6 max-w-6xl mx-auto">
                    {/* Kenapa Public Gold Content */}
                    <div className="mb-6 p-4 bg-blue-50 rounded-lg">
                      <h3 className="text-2xl font-bold text-gray-900 mb-4">Kenapa Public Gold?</h3>

                      <img alt="" src="/pg-hq.png" className="sm:w-full sm:h-full md:w-[40vw] md:h-[50vh] object-cover rounded-lg mb-4" />

                      <p className="text-lg text-gray-700 mb-4">
                        Public Gold adalah salah satu pengeluar emas syariah terkemuka di Malaysia. Kami menawarkan pelbagai produk emas yang patuh syariah, termasuk:
                      </p>

                      <ul className="list-disc list-inside text-lg text-gray-700 mb-4">
                        <li>Emas fizikal (barang fizikal)</li>
                        <li>Emas di akaun (simpanan emas secara elektronik)</li>
                        <li>Emas syariah (emas yang telah dipastikan patuh syariah)</li>
                      </ul>

                      <img alt="" src="/syariah1.png" className="px-auto sm:w-full sm:h-full md:w-[40vw] md:h-[50vh] object-cover rounded-lg mb-4" />


                      <p className="text-lg text-gray-700">
                        Kelebihan menyimpan emas dengan Public Gold:
                      </p>
                      <ul className="list-disc list-inside text-lg text-gray-700">
                        <li>Nilai emas terjamin</li>
                        <li>Tidak terjejas oleh inflasi</li>
                        <li>Mudah ditukar kepada tunai</li>
                        <li>Mudah diwariskan</li>
                        <li>Patuh syariah</li>
                      </ul>
                    </div>

                    {/* Company Details */}
                    <div className="mb-6 p-4 bg-green-50 rounded-lg">
                      <h3 className="text-2xl font-bold text-gray-900 mb-4">Tentang Public Gold</h3>
                      <p className="text-lg text-gray-700 mb-4">
                        Public Gold telah beroperasi sejak 2008 dan telah menjadi pengeluar emas syariah terkemuka di Malaysia. Kami mempunyai lebih 100 cawangan di seluruh negara dan lebih 100,000 pelanggan.
                      </p>
                      <p className="text-lg text-gray-700">
                        Kami bertujuan untuk membantu anda menguruskan kekayaan anda dengan lebih baik melalui emas.
                      </p>
                    </div>

                    {/* Branch Information */}
                    <div className="mb-6 p-4 bg-purple-50 rounded-lg">
                      <h3 className="text-2xl font-bold text-gray-900 mb-4">Lokasi Cawangan Public Gold</h3>
                      <p className="text-lg text-gray-700">
                        Kami mempunyai lebih 100 cawangan di seluruh Malaysia. Anda boleh menemui kami di:
                      </p>
                      <ul className="list-disc list-inside text-lg text-gray-700">
                        <li>Kuala Lumpur</li>
                        <li>Johor Bahru</li>
                        <li>Penang</li>
                        <li>Kedah</li>
                        <li>Selangor</li>
                        <li>Negeri Sembilan</li>
                        <li>Pahang</li>
                        <li>Perak</li>
                        <li>Kelantan</li>
                        <li>Terengganu</li>
                        <li>Sabah</li>
                        <li>Sarawak</li>
                      </ul>
                    </div>

                    {/* FAQ */}
                    <div className="mb-6 p-4 bg-orange-50 rounded-lg">
                      <h3 className="text-2xl font-bold text-gray-900 mb-4">Soalan Lazim</h3>
                      <div className="space-y-4">
                        <div>
                          <p className="font-semibold text-gray-900">Apakah Public Gold?</p>
                          <p className="text-gray-700">Public Gold adalah pengeluar emas syariah terkemuka di Malaysia yang menawarkan pelbagai produk emas yang patuh syariah.</p>
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900">Apakah kelebihan menyimpan emas dengan Public Gold?</p>
                          <p className="text-gray-700">Nilai emas terjamin, tidak terjejas oleh inflasi, mudah ditukar kepada tunai, mudah diwariskan, dan patuh syariah.</p>
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900">Apakah jenis emas yang tersedia?</p>
                          <p className="text-gray-700">Kami menawarkan emas fizikal, emas di akaun, dan emas syariah yang patuh syariah.</p>
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900">Apakah proses pembelian emas?</p>
                          <p className="text-gray-700">Anda boleh membeli emas melalui cawangan kami atau melalui akaun simpanan emas kami secara atas talian.</p>
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900">Apakah kelebihan akaun simpanan emas kami?</p>
                          <p className="text-gray-700">Anda boleh menyimpan emas secara elektronik dan memantau nilai simpanan anda secara real-time.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Mobile: Slide from bottom to up */}
          <div className="md:hidden absolute inset-x-0 bottom-0 max-h-full">
            <div className={`relative w-full transform transition-transform duration-300 ease-in-out ${isDrawerAnimating ? 'translate-y-full' : 'translate-y-0'
              }`}>
              <div className="bg-white rounded-t-2xl shadow-xl max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-200">
                  <h2 className="text-xl font-semibold text-gray-900">Kenapa Public Gold</h2>


                  <button
                    onClick={closeKenapaDrawer}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                  {/* Kenapa Public Gold Content */}
                  <div className="mb-6 p-4 bg-blue-50 rounded-lg">
                    <h3 className="text-2xl font-bold text-gray-900 mb-4">Kenapa Public Gold?</h3>

                    <img alt="" src="/pg-hq.png" className="w-full h-auto object-cover rounded-lg mb-4" />

                    <p className="text-lg text-gray-700 mb-4">
                      Public Gold adalah salah satu pengeluar emas syariah terkemuka di Malaysia. Kami menawarkan pelbagai produk emas yang patuh syariah, termasuk:
                    </p>
                    <ul className="list-disc list-inside text-lg text-gray-700 mb-4">
                      <li>Emas fizikal (barang fizikal)</li>
                      <li>Emas dalam Akaun (simpanan emas di akaun GAP)</li>
                      <li>Emas syariah (emas yang telah dipastikan patuh syariah)</li>
                    </ul>
                    <p className="text-lg text-gray-700">
                      Kelebihan menyimpan emas dengan Public Gold:
                    </p>
                    <ul className="list-disc list-inside text-lg text-gray-700">
                      <li>Nilai emas terjamin</li>
                      <li>Tidak terjejas oleh inflasi</li>
                      <li>Mudah ditukar kepada tunai</li>
                      <li>Mudah diwariskan</li>
                      <li>Patuh syariah</li>
                    </ul>

                    <img alt="" src="/syariah1.png" className="w-full h-auto object-cover rounded-lg mb-4 mt-4" />
                    <img alt="" src="/syariah.png" className="w-full h-auto object-cover rounded-lg mb-4 mt-4" />


                  </div>

                  {/* Company Details */}
                  <div className="mb-6 p-4 bg-green-50 rounded-lg">
                    <h3 className="text-2xl font-bold text-gray-900 mb-4">Tentang Public Gold</h3>
                    <p className="text-lg text-gray-700 mb-4">
                      Public Gold telah beroperasi sejak 2008 dan telah menjadi pengeluar emas syariah terkemuka di Malaysia. Kami mempunyai lebih 100 cawangan di seluruh negara dan lebih 100,000 pelanggan.
                    </p>
                    <p className="text-lg text-gray-700">
                      Kami bertujuan untuk membantu anda menguruskan kekayaan anda dengan lebih baik melalui emas.
                    </p>
                  </div>

                  {/* Branch Information */}
                  <div className="mb-6 p-4 bg-purple-50 rounded-lg">
                    <h3 className="text-2xl font-bold text-gray-900 mb-4">Lokasi cawangan Public Gold</h3>
                    <p className="text-lg text-gray-700">
                      Kami mempunyai lebih 100 cawangan di seluruh Malaysia. Anda boleh menemui kami di:
                    </p>

                    <img alt="" src="/pg-branch.png" className="w-full h-auto object-cover rounded-lg mb-4 mt-4" />


                    <ul className="list-disc list-inside text-lg text-gray-700">
                      <li>Kuala Lumpur</li>
                      <li>Johor Bahru</li>
                      <li>Penang</li>
                      <li>Kedah</li>
                      <li>Selangor</li>
                      <li>Negeri Sembilan</li>
                      <li>Pahang</li>
                      <li>Perak</li>
                      <li>Kelantan</li>
                      <li>Terengganu</li>
                      <li>Sabah</li>
                      <li>Sarawak</li>
                    </ul>
                  </div>

                  {/* FAQ */}
                  <div className="mb-6 p-4 bg-orange-50 rounded-lg">
                    <h3 className="text-2xl font-bold text-gray-900 mb-4">Soalan Lazim</h3>
                    <div className="space-y-4">
                      <div>
                        <p className="font-semibold text-gray-900">Apakah Public Gold?</p>
                        <p className="text-gray-700">Public Gold adalah pengeluar emas syariah terkemuka di Malaysia yang menawarkan pelbagai produk emas yang patuh syariah.</p>
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">Apakah kelebihan menyimpan emas dengan Public Gold?</p>
                        <p className="text-gray-700">Nilai emas terjamin, tidak terjejas oleh inflasi, mudah ditukar kepada tunai, mudah diwariskan, dan patuh syariah.</p>
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">Apakah jenis emas yang tersedia?</p>
                        <p className="text-gray-700">Kami menawarkan emas fizikal, emas di akuan, dan emas syariah yang patuh syariah.</p>
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">Apakah proses pembelian emas?</p>
                        <p className="text-gray-700">Anda boleh membeli emas melalui cawangan kami atau melalui akaun simpanan emas kami secara atas talian.</p>
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">Apakah kelebihan akaun simpanan emas kami?</p>
                        <p className="text-gray-700">Anda boleh menyimpan emas secara elektronik dan memantau nilai simpanan anda secara real-time.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Image Dialog Overlay */}
      {isImageDialogOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black bg-opacity-80 transition-opacity duration-300 animate-fadein"
          onClick={closeImageDialog}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          onTouchStart={handleDialogTouchStart}
          onTouchEnd={handleDialogTouchEnd}
        >
          <div
            className="relative max-w-4xl w-full h-full flex items-center justify-center"
            onClick={e => e.stopPropagation()}
          >
            {/* Prev Button */}
            <button
              className="absolute left-2 top-1/2 -translate-y-1/2 bg-black bg-opacity-40 text-white rounded-full p-2 hover:bg-opacity-70 transition"
              onClick={handlePrev}
              aria-label="Sebelumnya"
              style={{ zIndex: 2 }}
            >
              <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            {/* Next Button */}
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-black bg-opacity-40 text-white rounded-full p-2 hover:bg-opacity-70 transition"
              onClick={handleNext}
              aria-label="Seterusnya"
              style={{ zIndex: 2 }}
            >
              <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <button
              className="absolute top-4 right-4 text-white bg-black bg-opacity-40 rounded-full p-2 hover:bg-opacity-70 transition"
              onClick={closeImageDialog}
              aria-label="Tutup"
              style={{ zIndex: 2 }}
            >
              <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            {dialogImageSrc && (
              <img
                src={dialogImageSrc}
                alt="Zoomed"
                style={{
                  maxHeight: '80vh',
                  maxWidth: '90vw',
                  transform: `scale(${zoom}) translate(${imgOffset.x / zoom}px, ${imgOffset.y / zoom}px)`,
                  transition: isDragging ? 'none' : 'transform 0.2s',
                  cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in',
                  touchAction: 'none',
                  background: '#fff',
                  borderRadius: '1rem',
                  boxShadow: '0 4px 32px rgba(0,0,0,0.3)'
                }}
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                draggable={false}
              />
            )}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 items-center">
              <button
                className="bg-white bg-opacity-80 rounded-full px-3 py-1 text-black font-bold text-lg shadow hover:bg-opacity-100 transition"
                onClick={() => setZoom(z => Math.max(1, z - 0.2))}
                disabled={zoom <= 1}
              >
                -
              </button>
              <span className="text-white font-bold text-lg px-2">{Math.round(zoom * 100)}%</span>
              <button
                className="bg-white bg-opacity-80 rounded-full px-3 py-1 text-black font-bold text-lg shadow hover:bg-opacity-100 transition"
                onClick={() => setZoom(z => Math.min(3, z + 0.2))}
                disabled={zoom >= 3}
              >
                +
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp Floating Button */}
      {dealerInfo.no_tel && (
        <a
          href={dealerInfo.no_tel}
          target="_blank"
          rel="noopener noreferrer"
          className="fixed bottom-6 right-6 z-50 bg-green-500 hover:bg-green-600 text-white rounded-full shadow-lg flex items-center justify-center w-16 h-16 transition-colors duration-200"
          aria-label="WhatsApp"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="currentColor">
            <path d="M16 3C9.373 3 4 8.373 4 15c0 2.385.832 4.584 2.236 6.393L4 29l7.828-2.236C13.416 27.168 15.615 28 18 28c6.627 0 12-5.373 12-12S22.627 3 16 3zm0 22c-2.021 0-3.963-.627-5.57-1.803l-.397-.282-4.653 1.33 1.33-4.653-.282-.397C5.627 18.963 5 17.021 5 15c0-6.065 4.935-11 11-11s11 4.935 11 11-4.935 11-11 11zm5.29-7.71c-.26-.13-1.54-.76-1.78-.85-.24-.09-.41-.13-.58.13-.17.26-.67.85-.82 1.02-.15.17-.3.19-.56.06-.26-.13-1.09-.4-2.07-1.28-.76-.68-1.27-1.52-1.42-1.78-.15-.26-.02-.4.11-.53.11-.11.26-.3.39-.45.13-.15.17-.26.26-.43.09-.17.04-.32-.02-.45-.06-.13-.58-1.4-.8-1.92-.21-.51-.43-.44-.58-.45-.15-.01-.32-.01-.5-.01-.17 0-.45.06-.68.28-.23.22-.9.88-.9 2.15s.92 2.49 1.05 2.66c.13.17 1.81 2.77 4.39 3.78.61.21 1.09.33 1.46.42.61.13 1.16.11 1.6.07.49-.05 1.54-.63 1.76-1.24.22-.61.22-1.13.15-1.24-.07-.11-.24-.17-.5-.3z" />
          </svg>
        </a>
      )}

      <style jsx global>{`
        @keyframes shimmer {
          100% { left: 125%; }
        }
        .shimmer-animate {
          position: relative;
          overflow: hidden;
        }
        .shimmer-animate::after {
          content: '';
          position: absolute;
          top: 0; left: -75%; width: 50%; height: 100%;
          background: linear-gradient(120deg, transparent, rgba(255,255,255,0.4), transparent);
          animation: shimmer 2s infinite;
          pointer-events: none;
        }
      `}</style>
    </div>
  );
} 