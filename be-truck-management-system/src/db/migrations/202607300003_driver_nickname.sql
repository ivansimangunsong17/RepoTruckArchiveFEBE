alter table drivers add column if not exists nickname text;

update drivers
set nickname = split_part(trim(name), ' ', 1)
where (nickname is null or trim(nickname) = '')
  and name is not null
  and trim(name) <> '';
