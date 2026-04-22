# SDP Ticketing Assessment - SOC `CAR - Case Template`

Assessment date: April 22, 2026  
Scope: `29,021` tiket SOC dengan template `CAR - Case Template`, diexport dari ServiceDesk Plus pada rentang data `2024-01` sampai `2026-04`, lalu diperkaya dengan konteks workflow SOC yang lo jelasin.  
Catatan: dokumen ini sengaja fokus ke assessment kondisi existing. Belum masuk rekomendasi improvement.

## Executive Summary

Berdasarkan data tiket, struktur field, task, dan konteks workflow yang berjalan, SDP saat ini lebih berperan sebagai **arsip notifikasi alert otomatis** daripada **record case management** yang lengkap. Ticket memang berhasil dibuat, dikategorikan per customer, dan pada akhirnya ditutup. Tapi mayoritas tiket tidak meninggalkan jejak kerja analyst yang cukup untuk audit: closure comment hampir selalu kosong, resolution content kosong, notes hampir tidak ada, attachment hampir tidak ada, conversation sangat minim, dan task template secara praktik tidak dijalankan.

Temuan manual lo valid, dan setelah diperkaya dengan data penuh `29,021` tiket, polanya makin jelas: problem utamanya bukan cuma kualitas isi deskripsi, tapi juga **hilangnya artefak investigasi, justifikasi TP/FP, jejak notifikasi customer, dan konsistensi pemakaian field SDP itu sendiri**.

## Snapshot Singkat

- Total tiket: `29,021`
- Status: `29,019 Closed`, `1 Resolved`, `1 Open`
- Initial validation: `28,675 False Positive` dan `346 True Positive`
- Task-bearing tickets: `27,516`; dari jumlah itu `27,404` masih semua task `Open`
- Notes kosong: `29,013` tiket
- Attachment tidak ada: `29,014` tiket
- Conversation tidak ada: `25,942` tiket
- Closure comment kosong: `28,841` tiket
- Resolution content kosong: `29,021` tiket
- `mode`, `category`, `subcategory`, `item`, dan `group` semuanya kosong di `29,021` tiket

## SLA Compliance View

Di workflow SOC lo, SLA operasional ini **tidak** tercermin di field built-in SDP `sla`, tapi di custom UDF berikut:

- `udf_date_2701` = `Time of Detection`
- `udf_date_1807` = `1st Response Time`
- `udf_date_1808` = `Workaround Time`

Definisi yang dipakai untuk assessment ini adalah:

- `MTTD = Time of Detection -> 1st Response Time`
- `MTTR = Time of Detection -> Workaround Time`

Untuk quality guard, selisih negatif sampai `60` detik gue anggap efek rounding menit lalu dibulatkan ke `0`. Selisih negatif lebih dari itu gue tandai sebagai `invalid historical data`. Untuk target `MTTR`, data dipetakan berdasarkan **priority level** (`P1` / `P2` / `P3` / `P4`), karena di data existing ada variasi label seperti `P2 - Medium`.

### MTTD

Target `MTTD` adalah `15 menit` untuk semua tiket, tanpa membedakan priority. Dari `29,021` tiket, cuma `1,599` tiket (`5.51%`) yang punya measurement `MTTD` valid. Ada `27,375` tiket yang belum punya `1st Response Time`, dan `47` tiket lagi punya durasi negatif yang terlalu jauh untuk dianggap valid. Dari `1,599` measurement yang valid itu, `1,367` (`85.49%`) masih compliant terhadap target `15 menit`, sedangkan `232` tiket non-compliant. Median `MTTD` valid adalah `3.26 menit`, tapi `p90` sudah naik ke `51 menit`, dan masih ada `21` measurement yang lebih dari `24 jam`. Artinya, kalau dilihat hanya dari tiket yang memang punya timestamp lengkap, compliance-nya lumayan; tapi kalau dilihat dari seluruh populasi tiket SOC, yang benar-benar bisa dibuktikan compliant baru `4.71%`.

Ada satu nuansa penting: pemakaian field SLA ini terlihat jauh lebih matang di periode terbaru dibanding historis lama. Pada gabungan tiket `2026-03` sampai `2026-04`, coverage `MTTD` valid naik ke `59.27%` (`1,276 / 2,153` tiket), dan compliance pada measurement valid juga naik ke `93.18%` (`1,189 / 1,276`). Jadi assessment SLA `MTTD` ini perlu dibaca sebagai gabungan dua realitas: **instrumentasi historis yang sangat bolong**, dan **pemakaian field yang mulai jauh lebih konsisten di data paling baru**.

### MTTR

`MTTR` hanya relevan untuk tiket `True Positive`, dengan target:

- `P1` = `2 jam`
- `P2` = `5 jam`
- `P3` = `8 jam`
- `P4` = `1 hari`

Dari `346` tiket `True Positive`, ada `278` tiket (`80.35%`) yang punya measurement `MTTR` valid. Sebanyak `51` tiket belum punya `Workaround Time`, dan `17` tiket lagi punya durasi negatif yang invalid. Dari `278` measurement valid itu, `199` tiket (`71.58%`) compliant dan `79` tiket non-compliant. Median `MTTR` valid adalah `48 menit`, tapi `p90` sudah mencapai `1,450 menit` atau sekitar `24.17 jam`. Bahkan ada `28` measurement di atas `24 jam`, `9` di atas `7 hari`, dan `6` di atas `30 hari`, jadi outlier historisnya cukup berat dan jelas bisa mengganggu rata-rata.

Kalau dipecah per priority level `True Positive`, compliance atas measurement validnya adalah `60.00%` untuk `P1`, `73.50%` untuk `P2`, `57.14%` untuk `P3`, dan `71.43%` untuk `P4`. Di sisi lain, periode terbaru juga terlihat lebih sehat: pada gabungan `2026-03` sampai `2026-04`, ada `17 / 20` tiket `True Positive` yang punya measurement `MTTR` valid, dan `15 / 17` di antaranya compliant (`88.24%`).

Ada satu gap semantik yang penting buat dicatat: walaupun secara definisi bisnis `MTTR` hanya berlaku untuk `True Positive`, field `Workaround Time` ternyata juga terisi pada `1,309` tiket `False Positive`. Ini berarti field SLA tersebut belum sepenuhnya eksklusif merepresentasikan tindakan workaround / recommendation ke customer, dan masih dipakai dengan makna yang lebih longgar dari definisi operasional yang lo jelasin.

## Combined Findings

### 1. Task template ditempelkan ke seluruh tiket, padahal secara bisnis hanya relevan untuk True Positive

Data tetap menunjukkan bahwa task pada `CAR - Case Template` hampir tidak tersentuh: dari `29,021` tiket, `27,516` tiket punya task, `27,404` di antaranya masih seluruhnya `Open`, `27,516 / 27,516` tiket yang punya task tidak memiliki owner, dan `27,404` tiket tidak punya actual start/end sama sekali. Secara total ada `247,662` task yang terekspor; `246,838` masih `Open`, dan `247,662` tidak punya owner. Namun, berdasarkan konteks proses bisnis SOC, task ini sebenarnya dipakai hanya ketika tiket menjadi `True Positive` karena isi task akan dikonsumsi oleh `Unified SNC Platform` untuk membentuk incident report. Karena mayoritas tiket SOC adalah `False Positive` (`28,675` tiket), task tetap tercipta pada hampir seluruh populasi tiket dan akhirnya tampak tidak pernah digunakan. Assessment utamanya adalah adanya mismatch antara desain template SDP dengan kebutuhan proses aktual: task saat ini lebih berfungsi sebagai dependency integrasi legacy untuk incident report daripada workflow kerja harian analyst.

### 2. Deskripsi tiket masih template-driven dan kadang menyesatkan

Temuan lo soal description statis juga kebukti. Struktur deskripsi hampir selalu mengikuti pola yang sama: sapaan customer, alert name, time of alert, asset impacted, severity, description, lalu `Action Taken : -`. Narasi ini tidak menggambarkan proses analisa yang benar-benar terjadi. Frasa yang problematik seperti `menggunakan teknik fortigate` muncul berulang dalam data; dari analisa penuh sebelumnya, frasa itu ditemukan di `5,321` tiket. Jadi problem-nya bukan sekadar wording jelek, tapi ada indikator bahwa hasil enrichment naratif dari SOAR belum mewakili konteks alert secara benar.

### 3. Asset hostname masih cenderung merepresentasikan agent, collector, atau nama node teknis, bukan konteks aset terdampak yang paling relevan

Temuan lo soal asset hostname juga konsisten dengan data. Field `asset_impacted` memang selalu terisi, tapi nilai dominannya masih berupa nama teknis seperti `AD_Server_Primary-Karawang-CMWI`, `syslog-its-mtm-icc`, `pc-dashboard-its-mtm-icc`, `wazuh-manager1-gcp-mtm-icc`, dan `wazuh-manager2-gcp-mtm-icc`. Pola ini menunjukkan bahwa tiket lebih sering mewarisi nama sumber event/agent daripada mengekspresikan aset bisnis atau hostname yang paling relevan buat validasi analyst dan komunikasi ke customer.

### 4. Raw event / full log tidak terlihat tersimpan sebagai artefak tiket

Temuan lo soal kebutuhan full raw log juga terkonfirmasi dari bentuk data yang terekspor. Dalam export penuh, artefak utama tiket praktis hanya terdiri dari subject, description template, beberapa UDF ringkas, task template, dan metadata status/assignment. Tidak terlihat ada blob log mentah yang konsisten tersimpan di description, notes, attachment, atau conversation. Karena itu, validasi manual dari sisi analyst harus bergantung ke sistem lain di luar SDP, bukan dari ticket record itu sendiri.

### 5. Source IP memang sering kosong, walaupun tidak kosong di semua tiket

Field `source_ip` (`udf_sline_1827`) kosong di `1,865` tiket atau sekitar `6.43%` dari total tiket. Jadi ini bukan kasus mayoritas tiket, tapi gap-nya cukup besar untuk dianggap problem kualitas data. Di sisi lain, karena tidak ada raw log di tiket, analyst juga tidak punya fallback langsung di SDP saat field ini kosong.

### 6. Penetapan `True Positive` / `False Positive` tidak meninggalkan jejak pembenaran yang memadai

Temuan lo bahwa analyst terlalu gampang mencap TP/FP, kalau diterjemahkan ke bahasa assessment data, berarti **jejak justifikasi keputusan TP/FP hampir tidak tertinggal di tiket**. Distribusi saat ini adalah `28,675 False Positive` dan hanya `346 True Positive`. Tapi bukti pendukung keputusan itu nyaris tidak ada:

- hanya `8` tiket dari seluruh dataset yang punya notes,
- hanya `180` tiket yang punya closure comment,
- `29,021` tiket tidak punya resolution content,
- pada tiket `False Positive`, hanya `25` tiket yang punya closure comment,
- pada tiket `True Positive`, hanya `155` tiket yang punya closure comment, `10` tiket punya conversation, `7` tiket punya attachment, dan `6` tiket punya notes.

Artinya keputusan TP/FP memang ada di field, tapi alasan, bukti, dan tindakan lanjutannya hampir tidak terdokumentasi di SDP.

### 7. Index document belum terlihat berjalan sama sekali

Temuan lo soal nomor dokumen case juga valid. Dari export penuh, tidak ditemukan pola `CASE-SOC<TAHUN>-<BULAN>-<NO-TIKET>` pada field ticket yang berhasil ditarik. Hasil pencarian pola `CASE-SOC` pada data export adalah `0`. Jadi dari sisi data existing, index document belum menjadi bagian dari record tiket.

### 8. `Attack Type` praktis masih default dan belum berfungsi sebagai klasifikasi

Temuan lo soal `Attack Type` juga kebukti. Field yang paling dekat dengan fungsi ini adalah `classification_reason` / `udf_pick_1806`. Distribusinya sangat berat ke default:

- `Other`: `28,689`
- `Agent Issue`: `59`
- `Malware`: `56`
- `Web Attack`: `52`
- `SIEM Issue`: `51`

Jadi secara praktis field ini belum benar-benar dipakai untuk membedakan jenis serangan atau alasan klasifikasi secara konsisten.

### 9. Close comment hampir selalu kosong

Temuan lo soal close comment kosong sangat kuat di data. `28,841` tiket tidak punya closure comment. Kalau dilihat khusus tiket berstatus `Closed`, `28,839` dari `29,019` closed ticket juga tetap tidak punya closure comment. Artinya status `Closed` saat ini tidak identik dengan adanya ringkasan penutupan, alasan close, atau handover evidence.

### 10. Standard field SDP untuk routing dan klasifikasi praktis tidak dipakai

Ini temuan tambahan yang belum muncul di daftar lo. Field standar SDP seperti `mode`, `category`, `subcategory`, `item`, dan `group` kosong di `29,021 / 29,021` tiket. Jadi walaupun ticket berada di dalam platform ITSM, klasifikasi dan routing utamanya tidak berjalan lewat struktur standar SDP, tapi lebih lewat template, site, subject pattern, dan custom fields.

### 11. Artefak closure dan resolution hampir seluruhnya hilang

Selain closure comment kosong, ada gap lain yang signifikan:

- `resolution.content` kosong di `29,021` tiket,
- notes kosong di `29,013` tiket,
- attachment tidak ada di `29,014` tiket,
- conversation tidak ada di `25,942` tiket,
- due date kosong di `28,153` tiket,
- SLA kosong di `28,154` tiket.

Jadi tiket bisa masuk status closed tanpa meninggalkan paket artefak closure yang normal untuk case record.

### 12. Penerapan task template sendiri tidak konsisten

Selain task tidak dikerjakan, penerapan task antar tiket juga tidak seragam padahal template-nya sama. Distribusi jumlah task adalah:

- `27,186` tiket punya `9` task,
- `1,505` tiket punya `0` task,
- `226` tiket punya `10` task,
- `104` tiket punya `7` task.

Artinya ada inkonsistensi historis dalam bagaimana task template ditempelkan ke tiket SOC yang seharusnya satu family.

### 13. Field `analyst_pic` masih banyak tertinggal di nilai default walaupun ticket sudah dipegang analyst tertentu

Field `analyst_pic` (`udf_pick_2704`) masih bernilai `SOC` di `28,591` tiket atau sekitar `98.52%`. Padahal field `technician` di data justru sudah terdistribusi ke nama analyst seperti `Muhammad Ilham Alghifari`, `Jeffri Wahyu Putra Sitompul`, `Ramadhanty Sadewi`, `Muhammad Atalarik Syach Ajay`, dan lain-lain. Ini menunjukkan ada gap antara assignment actual di tiket dengan pencatatan PIC di custom field.

### 14. Format subject dan mapping severity ke priority tidak sepenuhnya konsisten

Mayoritas subject memang mengikuti pola `[SE] | customer | attack_type | severity | title`, tapi tidak semuanya seragam. Distribusi segment subject menunjukkan `27,066` tiket punya `5` segmen, `1,946` tiket punya `4` segmen, `6` tiket punya `3` segmen, `2` tiket punya `7` segmen, dan `1` tiket hanya punya `1` segmen. Di samping itu, severity di subject juga tidak selalu memetakan ke priority yang sama. Contohnya, label `High` paling banyak masuk ke `P2 - High`, tapi juga muncul cukup banyak di `P2 - Medium`. Label `Medium` juga muncul di `P3 - Medium` dan `P2 - Medium`. Jadi subject saat ini belum bisa diperlakukan sebagai string yang benar-benar standar dan reliable.

### 15. Ada indikasi volume tiket yang sangat repetitif / noisy

Dari `29,021` tiket, hanya ada `1,217` subject unik. Sebanyak `28,255` tiket berasal dari subject yang berulang. Ada `42` subject yang masing-masing muncul lebih dari `100` kali, dan `15` subject yang muncul lebih dari `500` kali. Subject paling dominan adalah:

- `[SE] | CMWI | Brute Force | High | User account locked out (multiple login errors)` sebanyak `5,053` tiket
- `[SE] | CMWI | windows_security | High | Multiple Windows audit failure events` sebanyak `2,549` tiket
- `[SE] | CMWI | Account Manipulation | High | User account changed` sebanyak `1,332` tiket

Assessment-nya: ticket population saat ini sangat dipengaruhi oleh alert berulang, sehingga SDP menampung banyak event-level repetition, bukan hanya case-level uniqueness.

### 16. Jejak notifikasi ke customer memang nyaris tidak terlihat di SDP

Ini temuan tambahan yang langsung nyambung ke konteks workflow yang lo jelasin. Dari sisi bisnis, kalau analyst menetapkan `True Positive`, harusnya ada tindakan ke customer. Tapi di data tiket, artefak tindakan itu hampir tidak kelihatan. Pada `346` tiket `True Positive`, hanya `10` yang punya conversation, `7` yang punya attachment, `6` yang punya notes, dan `155` yang punya closure comment. Jadi concern lo bahwa notifikasi ke customer tidak punya artefak di ticketing memang didukung oleh data existing.

### 17. Secara keseluruhan, lifecycle tiket sekarang lebih mirip wrapper alert daripada case file yang lengkap

Temuan gabungannya ada di sini: `99.99%` tiket sudah `Closed`, tapi hampir semua tetap tidak punya closure narrative, resolution content, note, attachment, dan jejak task execution. Kombinasi ini menandakan bahwa fungsi utama tiket sekarang adalah sebagai pembungkus alert otomatis dan penanda status, bukan sebagai single source of truth atas investigasi, keputusan analyst, dan komunikasi ke customer.

## Catatan Pembacaan Report

Report ini sengaja belum menilai apakah kondisi existing itu benar atau salah dari sisi desain target. Yang dibuktikan di sini hanya: **apa yang saat ini benar-benar tercatat di data tiket**, dan **apa yang ternyata tidak tercatat** walaupun secara bisnis workflow-nya memang terjadi.

## Referensi Data Pendukung

- Raw export lengkap: `/mnt/d/sdp-ai/.tmp/exports/soc_car/raw`
- Ticket summary: `/mnt/d/sdp-ai/.tmp/exports/soc_car/summary/tickets_summary.ndjson`
- UDF alias reference: `/mnt/d/sdp-ai/.tmp/exports/soc_car/refs/udf_alias.json`
- Metrics appendix: `/mnt/d/sdp-ai/.tmp/reports/sdp_ticketing_assessment_metrics.json`
- SLA appendix: `/mnt/d/sdp-ai/.tmp/reports/sdp_ticketing_assessment_sla_metrics.json`
