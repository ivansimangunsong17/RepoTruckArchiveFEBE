-- SO internal otomatis tidak lagi dipakai sebagai nomor kerja.
-- Nomor SO untuk Finance tetap disimpan di accurate_so_number.
update sales_orders
set so_number = null,
    updated_at = now()
where so_number ~ '^SO-ARM-[0-9]{6}-[0-9]{4}$'
