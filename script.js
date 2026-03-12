// ==================== KONFIGURASI AWAL ====================
const DEFAULT_CENTER = [-2.5, 112.0];
const DEFAULT_ZOOM = 5;

// Inisialisasi peta dengan atribusi dimatikan
const map = L.map('map', {
    attributionControl: false // Matikan atribusi default
}).setView(DEFAULT_CENTER, DEFAULT_ZOOM);

// ==================== LAYER PETA ====================
// Default Leaflet (OpenStreetMap) - tanpa atribusi
const defaultLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19
    // attribution dihapus
});

// Google Streets - tanpa atribusi
const googleStreets = L.tileLayer('http://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
    maxZoom: 20,
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
    // attribution dihapus
});

// Google Hybrid (Satelit dengan label) - tanpa atribusi
const googleHybrid = L.tileLayer('http://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}', {
    maxZoom: 20,
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
    // attribution dihapus
});

// Set default layer (Default Leaflet)
defaultLayer.addTo(map);

// ==================== CONTROL LAYER ====================
// Hanya 3 layer: Default, Google Streets, Google Hybrid
const baseMaps = {
    "Default": defaultLayer,
    "Google Maps": googleStreets,
    "Satelit": googleHybrid
};

L.control.layers(baseMaps).addTo(map);

// Inisialisasi marker cluster group
const markersCluster = L.markerClusterGroup({
    maxClusterRadius: 50,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: true,
    zoomToBoundsOnClick: true
});

// Variabel global
let allLocations = [];
let markers = [];
let currentFilteredIds = new Set();

// ==================== FUNGSI NOTIFICATION ====================
function showNotification(message) {
    // Cek apakah sudah ada notification
    let notification = document.querySelector('.map-notification');
    
    if (!notification) {
        notification = document.createElement('div');
        notification.className = 'map-notification';
        document.body.appendChild(notification);
    }
    
    notification.innerHTML = `<i class="fas fa-check-circle"></i> ${message}`;
    notification.classList.add('show');
    
    setTimeout(() => {
        notification.classList.remove('show');
    }, 2000);
}

// ==================== FUNGSI RESET MAP ====================
function resetMapToDefault() {
    // Reset center dan zoom dengan animasi halus
    map.flyTo(DEFAULT_CENTER, DEFAULT_ZOOM, {
        duration: 1.5,
        easeLinearity: 0.25
    });
    
    // Reset filter ke "Semua Provinsi"
    const provinsiFilter = document.getElementById('provinsiFilter');
    if (provinsiFilter) {
        provinsiFilter.value = 'ALL';
    }
    
    // Reset search input
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.value = '';
    }
    
    // Trigger filter untuk menampilkan semua lokasi
    filterAndDisplayLocations();
    
    // Tutup semua popup yang terbuka
    map.closePopup();
    
    // Tampilkan notifikasi
    showNotification('Kembali ke tampilan awal');
}

// Fungsi untuk menggabungkan lokasi (untuk ditampilkan di sidebar/popup)
function formatLokasi(loc) {
    if (loc.Provinsi && loc.Wilayah && loc.Kecamatan && loc.Desa) {
        return `${loc.Provinsi} - ${loc.Wilayah}, ${loc.Kecamatan}, ${loc.Desa}`;
    } else if (loc.Lokasi) {
        // Fallback ke format lama jika masih ada
        return loc.Lokasi;
    } else {
        return 'Unknown Location';
    }
}

// Ekstrak provinsi (sekarang langsung ada kolom Provinsi)
function getProvinsi(loc) {
    return loc.Provinsi || 'Unknown';
}

// Fungsi parse koordinat dengan validasi
function parseKoordinat(koordinat) {
    if (!koordinat) return null;
    
    try {
        // Bersihkan string
        let clean = koordinat.toString().trim();
        
        // Split dengan koma
        let parts = clean.split(',');
        if (parts.length !== 2) {
            // Coba split dengan spasi
            parts = clean.split(' ');
            if (parts.length !== 2) return null;
        }
        
        let lat = parseFloat(parts[0].trim());
        let lng = parseFloat(parts[1].trim());
        
        // Jika latitude di luar range Indonesia, kemungkinan terbalik
        if ((lat > 6 || lat < -11) && (lng <= 141 && lng >= 95)) {
            // Tukar posisi
            [lat, lng] = [lng, lat];
        }
        
        // Validasi range koordinat Indonesia
        if (isNaN(lat) || isNaN(lng)) return null;
        if (lat < -11 || lat > 6 || lng < 95 || lng > 141) return null;
        
        return { lat, lng };
    } catch (e) {
        console.error('Error parsing koordinat:', koordinat, e);
        return null;
    }
}

// Buat popup content
function createPopupContent(loc) {
    const koord = parseKoordinat(loc.Koordinat);
    const hasDataSumur = loc['Data Sumur'] && loc['Data Sumur'] !== '' && loc['Data Sumur'] !== 'Klik disini';
    
    // Format lokasi yang rapi
    const lokasiFormatted = formatLokasi(loc);
    
    return `
        <div class="popup-title">${loc.ID}</div>
        <div class="popup-detail">
            <i class="fas fa-map-marker-alt"></i> 
            <div style="flex:1">${lokasiFormatted}</div>
        </div>
        <div class="popup-detail">
            <i class="fas fa-globe"></i> 
            ${koord ? koord.lat.toFixed(5) + ', ' + koord.lng.toFixed(5) : 'Koordinat tidak valid'}
        </div>
        ${hasDataSumur ? `
            <div class="popup-detail" style="margin-top:8px">
                <i class="fas fa-water"></i> 
                <a href="${loc['Data Sumur']}" target="_blank" class="sumur-link">
                    <i class="fas fa-external-link-alt"></i> Klik disini untuk Data Sumur
                </a>
            </div>
        ` : ''}
    `;
}

// Buat marker di peta dengan clustering
function createMarkers(locations) {
    // Hapus semua marker dari cluster
    markersCluster.clearLayers();
    markers = [];

    let validCount = 0;
    let invalidCount = 0;

    locations.forEach((loc) => {
        const koord = parseKoordinat(loc.Koordinat);
        if (!koord) {
            invalidCount++;
            console.log('Koordinat tidak valid:', loc.ID, loc.Koordinat);
            return;
        }
        validCount++;

        // Buat marker
        const marker = L.marker([koord.lat, koord.lng], {
            title: loc.ID
        });

        // Bind popup
        marker.bindPopup(createPopupContent(loc));

        // Event click untuk highlight di sidebar
        marker.on('click', () => {
            highlightLocation(loc.ID);
        });

        // Simpan reference marker dengan ID
        marker.locId = loc.ID;
        marker.locData = loc;
        
        markers.push(marker);
        markersCluster.addLayer(marker);
    });

    console.log(`Marker dibuat: ${validCount} valid, ${invalidCount} tidak valid`);
    
    // Tambahkan cluster group ke peta
    map.addLayer(markersCluster);
    
    // Tampilkan info di footer
    if (invalidCount > 0) {
        const footer = document.querySelector('.footer-note');
        if (footer) {
            footer.innerHTML += `<br><small style="color: #e74c3c;">⚠️ ${invalidCount} data dengan koordinat tidak valid</small>`;
        }
    }
}

// Highlight lokasi di daftar
function highlightLocation(id) {
    const items = document.querySelectorAll('.location-item');
    items.forEach(item => {
        if (item.dataset.id === id) {
            item.style.backgroundColor = '#e3f2fd';
            item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else {
            item.style.backgroundColor = 'white';
        }
    });
}

// Filter dan tampilkan daftar lokasi
function filterAndDisplayLocations() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase().trim();
    const selectedProvinsi = document.getElementById('provinsiFilter').value;
    
    const filtered = allLocations.filter(loc => {
        const prov = getProvinsi(loc);
        const matchesProv = selectedProvinsi === 'ALL' || prov === selectedProvinsi;
        
        // Search di semua field yang tersedia
        const searchableText = `
            ${loc.ID} 
            ${loc.Provinsi || ''} 
            ${loc.Wilayah || ''} 
            ${loc.Kecamatan || ''} 
            ${loc.Desa || ''} 
            ${loc.Lokasi || ''}
        `.toLowerCase();
        
        const matchesSearch = searchTerm === '' || searchableText.includes(searchTerm);
        
        return matchesProv && matchesSearch;
    });

    // Update marker visibility di cluster
    currentFilteredIds.clear();
    filtered.forEach(loc => currentFilteredIds.add(loc.ID));

    // Hapus semua marker dari cluster
    markersCluster.clearLayers();

    // Tambahkan marker yang sesuai filter
    markers.forEach(marker => {
        if (currentFilteredIds.has(marker.locId)) {
            markersCluster.addLayer(marker);
        }
    });

   // Render daftar dengan format baru
const listHtml = filtered.map(loc => {
    const koord = parseKoordinat(loc.Koordinat);
    const hasDataSumur = loc['Data Sumur'] && loc['Data Sumur'] !== '' && loc['Data Sumur'] !== 'Klik disini';
    
    // Format tampilan di sidebar
    let title = '';
    let subtitle = '';
    
    if (loc.Wilayah) {
        title = `${loc.Wilayah}`;
        subtitle = `${loc.Kecamatan || ''} ${loc.Desa || ''}`.trim();
    } else {
        // Fallback ke format lama
        const parts = (loc.Lokasi || '').split(' - ');
        title = parts.length > 1 ? parts[1] : loc.Lokasi || '';
        subtitle = parts.length > 0 ? parts[0] : '';
    }
    
    // Format koordinat dengan X dan Y saja (tanpa icon panah)
    const coordDisplay = koord ? 
        `<span style="display: inline-flex; align-items: center; gap: 16px;">
            <span><strong>X:</strong> ${koord.lng.toFixed(5)}</span>
            <span><strong>Y:</strong> ${koord.lat.toFixed(5)}</span>
        </span>` : 
        'Koordinat tidak valid';
    
    return `
        <div class="location-item" data-id="${loc.ID}" onclick="goToLocation('${loc.ID}')">
            <div class="title">
                <span class="id-badge">${loc.ID}</span>
                ${title}
            </div>
            <div class="sub">
                <span><i class="fas fa-map-pin"></i> ${getProvinsi(loc)}</span>
                ${hasDataSumur ? '<span><i class="fas fa-water"></i> Sumur</span>' : ''}
                ${subtitle ? `<span>${subtitle}</span>` : ''}
            </div>
            <div class="coord">
                ${coordDisplay}
            </div>
        </div>
    `;
}).join('');

    document.getElementById('locationList').innerHTML = 
        filtered.length ? listHtml : '<div style="text-align: center; padding: 30px; color: #7f8c8d;"><i class="fas fa-search"></i> Tidak ada lokasi ditemukan</div>';
}
// Buat popup content
function createPopupContent(loc) {
    const koord = parseKoordinat(loc.Koordinat);
    const hasDataSumur = loc['Data Sumur'] && loc['Data Sumur'] !== '' && loc['Data Sumur'] !== 'Klik disini';
    
    // Format lokasi yang rapi
    const lokasiFormatted = formatLokasi(loc);
    
    // Format koordinat dengan X dan Y saja (tanpa icon panah)
    const coordDisplay = koord ? 
        `<span style="display: flex; align-items: center; gap: 20px; margin-top: 4px;">
            <span style="background: #f1f5f9; padding: 4px 12px; border-radius: 20px;">
                <strong>X:</strong> ${koord.lng.toFixed(5)}
            </span>
            <span style="background: #f1f5f9; padding: 4px 12px; border-radius: 20px;">
                <strong>Y:</strong> ${koord.lat.toFixed(5)}
            </span>
        </span>` : 
        'Koordinat tidak valid';
    
    return `
        <div class="popup-title">${loc.ID}</div>
        <div class="popup-detail">
            <i class="fas fa-map-marker-alt"></i> 
            <div style="flex:1">${lokasiFormatted}</div>
        </div>
        <div class="popup-detail">
            <i class="fas fa-globe"></i> 
            <div style="flex:1">${coordDisplay}</div>
        </div>
        ${hasDataSumur ? `
            <div class="popup-detail" style="margin-top:8px">
                <i class="fas fa-water"></i> 
                <a href="${loc['Data Sumur']}" target="_blank" class="sumur-link">
                    <i class="fas fa-external-link-alt"></i> Klik disini untuk Data Sumur
                </a>
            </div>
        ` : ''}
    `;
}
// Fungsi global untuk navigasi dari item list
window.goToLocation = function(id) {
    const loc = allLocations.find(l => l.ID === id);
    if (!loc) return;
    
    const koord = parseKoordinat(loc.Koordinat);
    if (!koord) return;
    
    // Zoom ke lokasi
    map.setView([koord.lat, koord.lng], 14);
    
    // Cari marker dan buka popup
    const marker = markers.find(m => m.locId === id);
    if (marker) {
        setTimeout(() => {
            marker.openPopup();
        }, 300);
    }
    
    highlightLocation(id);
};

// Load data dari file JSON
async function loadData() {
    const locationList = document.getElementById('locationList');
    const totalSpan = document.getElementById('totalCount');
    
    try {
        const response = await fetch('Maps Point.json', {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!Array.isArray(data)) {
            throw new Error('Data JSON bukan array');
        }
        
        allLocations = data;
        
        // Update total count
        totalSpan.textContent = allLocations.length;
        
        // Filter data yang valid koordinatnya untuk log saja
        const validLocations = allLocations.filter(loc => {
            const koord = parseKoordinat(loc.Koordinat);
            return koord !== null;
        });
        
        console.log(`Total data: ${allLocations.length}, Valid: ${validLocations.length}`);
        
        if (validLocations.length === 0) {
            throw new Error('Tidak ada data dengan koordinat valid');
        }
        
        // Isi filter provinsi (gunakan kolom Provinsi jika ada)
        const provinsiSet = new Set();
        allLocations.forEach(loc => {
            if (loc.Provinsi) {
                provinsiSet.add(loc.Provinsi);
            } else if (loc.Lokasi) {
                // Fallback ke parsing dari Lokasi
                const prov = loc.Lokasi.split(' - ')[0];
                provinsiSet.add(prov);
            }
        });
        
        const provinsiList = Array.from(provinsiSet).sort();
        const filterSelect = document.getElementById('provinsiFilter');
        
        provinsiList.forEach(prov => {
            if (prov && prov !== 'Unknown') {
                const option = document.createElement('option');
                option.value = prov;
                option.textContent = prov;
                filterSelect.appendChild(option);
            }
        });

        // Buat marker dengan clustering
        createMarkers(allLocations);

        // Tampilkan daftar lokasi
        filterAndDisplayLocations();

    } catch (error) {
        console.error('Error detail:', error);
        
        locationList.innerHTML = `
            <div class="error">
                <i class="fas fa-exclamation-triangle"></i> 
                <h3>Gagal memuat Maps Point.json</h3>
                <p style="margin-top: 10px; font-size: 0.9rem;">${error.message}</p>
                <p style="margin-top: 15px; font-size: 0.8rem; color: #7f8c8d;">
                    Pastikan:<br>
                    1. File Maps Point.json ada di folder yang sama<br>
                    2. Format JSON valid (dengan kolom Provinsi, Wilayah, Kecamatan, Desa)<br>
                    3. Jalankan dengan Live Server / web server
                </p>
            </div>
        `;
    }
}

// ==================== EVENT LISTENERS ====================
// Event listener untuk tombol reset
document.addEventListener('DOMContentLoaded', function() {
    const resetBtn = document.getElementById('resetMapBtn');
    if (resetBtn) {
        resetBtn.addEventListener('click', resetMapToDefault);
    }
});

// Search dengan debounce
let searchTimeout;
document.getElementById('searchInput').addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(filterAndDisplayLocations, 300);
});

document.getElementById('provinsiFilter').addEventListener('change', filterAndDisplayLocations);

// Handle resize
window.addEventListener('resize', () => {
    setTimeout(() => {
        map.invalidateSize();
    }, 100);
});

// Load data saat halaman siap
document.addEventListener('DOMContentLoaded', loadData);